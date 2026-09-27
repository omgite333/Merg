import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { env } from "./env";
import type { LlmApiKeyName, LlmModelName, LlmProviderId } from "./schema/env.schema";

/** Derived from the validated env module so the chain and the config agree. */
export type ProviderId = LlmProviderId;

export interface LlmOptions {
  temperature: number;
  maxTokens: number;
  /** Distinguishes call sites in the logs — e.g. "review-agent", "summary-agent". */
  label: string;
}

export interface LlmResponse {
  content: string;
  provider: ProviderId;
  model: string;
  /** How many providers were tried, including the one that succeeded. */
  attempts: number;
  durationMs: number;
}

/** Thrown when every configured provider has been exhausted. */
export class AllProvidersFailedError extends Error {
  readonly failures: { provider: ProviderId; model: string; reason: string }[];

  constructor(failures: { provider: ProviderId; model: string; reason: string }[]) {
    super(
      `Every configured LLM provider failed: ${failures
        .map((f) => `${f.provider} (${f.reason})`)
        .join("; ")}`
    );
    this.name = "AllProvidersFailedError";
    this.failures = failures;
  }
}

interface ProviderSpec {
  id: ProviderId;
  apiKeyEnv: LlmApiKeyName;
  modelEnv: LlmModelName;
  defaultModel: string;
  build: (args: { apiKey: string; model: string; temperature: number; maxTokens: number }) => BaseChatModel;
}

// Order here is the default failover order: Groq first (cheapest and fastest
// for the review agents), then Gemini, then OpenAI-compatible last so a
// self-hosted endpoint or a big-context model is the last resort.
const PROVIDERS: ProviderSpec[] = [
  {
    id: "groq",
    apiKeyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModel: "openai/gpt-oss-120b",
    build: ({ apiKey, model, temperature, maxTokens }) =>
      new ChatGroq({ apiKey, model, temperature, maxTokens }),
  },
  {
    id: "gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.5-flash",
    build: ({ apiKey, model, temperature, maxTokens }) =>
      new ChatGoogleGenerativeAI({
        apiKey,
        model,
        temperature,
        maxOutputTokens: maxTokens,
      }),
  },
  {
    id: "openai",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    build: ({ apiKey, model, temperature, maxTokens }) =>
      new ChatOpenAI({ apiKey, model, temperature, maxTokens }),
  },
];

const DEFAULT_TIMEOUT_MS = 60_000;

function log(entry: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), component: "llm", ...entry }));
}

function resolveOrder(): ProviderSpec[] {
  const override = env.LLM_PROVIDER_ORDER?.trim();
  if (!override) return PROVIDERS;
  const wanted = override
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  return wanted
    .map((id) => PROVIDERS.find((p) => p.id === id))
    .filter((p): p is ProviderSpec => Boolean(p));
}

/**
 * The providers this deployment can actually reach, in failover order. A
 * provider with no API key is dropped rather than attempted, so an unconfigured
 * fallback never costs a round trip.
 */
export function availableProviders(): ProviderSpec[] {
  return resolveOrder().filter((spec) => Boolean(env[spec.apiKeyEnv]));
}

function statusOf(error: any): number | undefined {
  const candidates = [
    error?.status,
    error?.statusCode,
    error?.response?.status,
    error?.error?.status,
    error?.error?.code,
    error?.cause?.status,
  ];
  for (const value of candidates) {
    if (typeof value === "number") return value;
  }
  return undefined;
}

function reasonOf(error: any): string {
  const status = statusOf(error);
  const message =
    typeof error?.message === "string"
      ? error.message
      : typeof error?.error?.message === "string"
        ? error.error.message
        : String(error);
  return status ? `${status}: ${message}` : message;
}

/**
 * A malformed request fails the same way on every provider, so there is nothing
 * to gain by burning the rest of the chain. Everything else — rate limits,
 * 5xx, network blips, a hung socket — is exactly what failover exists for.
 */
function isFailoverWorthy(error: any): boolean {
  const status = statusOf(error);
  if (status === 400 || status === 422) return false;
  return true;
}

function isAuthError(error: any): boolean {
  const status = statusOf(error);
  return status === 401 || status === 403;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, provider: ProviderId): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Request to ${provider} timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    }),
  ]).finally(() => clearTimeout(timer!)) as Promise<T>;
}

/**
 * LangChain hands back a plain string from some providers and an array of
 * content blocks from others. Both call sites downstream assume a string, so
 * flatten it once here rather than at every parse site.
 */
export function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : String(content);
  return content
    .map((block: any) => {
      if (typeof block === "string") return block;
      if (typeof block?.text === "string") return block.text;
      if (typeof block?.text?.value === "string") return block.text.value;
      return "";
    })
    .filter(Boolean)
    .join("");
}

/**
 * Runs one request down the failover chain, reporting which provider actually
 * served it. `providers` is injectable so the chain can be tested without env
 * or network; production callers use the env-derived default.
 */
export async function runChain(
  providers: { id: ProviderId; model: string; invoke: (messages: any[]) => Promise<any> }[],
  messages: any[],
  options: LlmOptions
): Promise<LlmResponse> {
  const startedAt = Date.now();
  const failures: { provider: ProviderId; model: string; reason: string }[] = [];

  for (let i = 0; i < providers.length; i++) {
    const entry = providers[i]!;
    const attemptStartedAt = Date.now();
    try {
      const response = await withTimeout(
        Promise.resolve().then(() => entry.invoke(messages)),
        env.LLM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
        entry.id
      );
      const durationMs = Date.now() - attemptStartedAt;
      log({
        event: "llm.served",
        label: options.label,
        provider: entry.id,
        model: entry.model,
        attempt: i + 1,
        of: providers.length,
        durationMs,
        totalMs: Date.now() - startedAt,
      });
      return {
        content: normalizeContent(response?.content),
        provider: entry.id,
        model: entry.model,
        attempts: i + 1,
        durationMs: Date.now() - startedAt,
      };
    } catch (error: any) {
      const reason = reasonOf(error);
      failures.push({ provider: entry.id, model: entry.model, reason });

      if (!isFailoverWorthy(error)) {
        log({
          event: "llm.fatal",
          label: options.label,
          provider: entry.id,
          attempt: i + 1,
          of: providers.length,
          reason,
        });
        throw error;
      }

      const level = isAuthError(error) ? "llm.auth_failed" : "llm.failover";
      log({
        event: level,
        label: options.label,
        provider: entry.id,
        attempt: i + 1,
        of: providers.length,
        reason,
        ...(isAuthError(error) ? { hint: "check the API key for this provider" } : {}),
        next: providers[i + 1]?.id ?? null,
      });
    }
  }

  log({
    event: "llm.exhausted",
    label: options.label,
    tried: failures.map((f) => f.provider),
  });
  throw new AllProvidersFailedError(failures);
}

/**
 * Clients are cached per (provider, model, temperature, maxTokens) so the
 * review loop — three agents across every file in the PR — reuses one client
 * instead of building a new one per invocation. Construction stays lazy: a
 * deployment with no keys configured must not throw at import time.
 */
const clientCache = new Map<string, BaseChatModel>();

function clientFor(
  spec: ProviderSpec,
  args: { apiKey: string; model: string; temperature: number; maxTokens: number }
): BaseChatModel {
  const key = `${spec.id}:${args.model}:${args.temperature}:${args.maxTokens}`;
  let client = clientCache.get(key);
  if (!client) {
    client = spec.build(args);
    clientCache.set(key, client);
  }
  return client;
}

/**
 * The single entry point every LLM call in the worker goes through.
 */
export async function invokeWithFallback(
  messages: any[],
  options: LlmOptions
): Promise<LlmResponse> {
  const specs = availableProviders();
  if (specs.length === 0) {
    throw new AllProvidersFailedError([
      {
        provider: PROVIDERS[0]!.id,
        model: PROVIDERS[0]!.defaultModel,
        reason: "no provider API keys configured (expected one of GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY)",
      },
    ]);
  }

  const chain = specs.map((spec) => {
    const model = env[spec.modelEnv]?.trim() || spec.defaultModel;
    return {
      id: spec.id,
      model,
      invoke: (messages: any[]) =>
        clientFor(spec, {
          apiKey: env[spec.apiKeyEnv]!,
          model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
        }).invoke(messages),
    };
  });

  return runChain(chain, messages, options);
}
