import { z } from "zod";

/**
 * The review worker's environment schema, separate from `env.ts` so tests can
 * assert on validation without importing the parsed singleton, which throws on
 * a deliberately incomplete environment.
 */

/**
 * The provider ids the failover chain in `llmProvider.ts` understands. This is
 * the single source of truth: `ProviderId` is derived from it there, and
 * `LLM_PROVIDER_ORDER` is validated against it below.
 */
export const LLM_PROVIDER_IDS = ["groq", "gemini", "openai"] as const;
export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

/** Which env var holds each provider's key. */
export const LLM_API_KEY_NAMES = {
  groq: "GROQ_API_KEY",
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
} as const;

export type LlmApiKeyName = (typeof LLM_API_KEY_NAMES)[LlmProviderId];
export type LlmModelName = "GROQ_MODEL" | "GEMINI_MODEL" | "OPENAI_MODEL";

function orderedProviders(value: string): LlmProviderId[] {
  return value
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id): id is LlmProviderId => (LLM_PROVIDER_IDS as readonly string[]).includes(id));
}

/** An empty `LLM_TIMEOUT_MS=` means "unset" and falls back to the default. */
const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

/**
 * `z.url()` is not enough: `new URL("localhost:6379")` parses happily (protocol
 * "localhost:", empty host), so a missing `redis://` would pass validation and
 * then fail at connect time. zod also runs this refine after `.url()` has
 * already failed, hence the try/catch.
 */
const redisUrl = () =>
  z.string().url().refine(
    (value) => {
      try {
        const url = new URL(value);
        return (url.protocol === "redis:" || url.protocol === "rediss:") && url.host.length > 0;
      } catch {
        return false;
      }
    },
    { message: "must be a redis:// or rediss:// URL" }
  );

/** A key that is present but blank is a mistake; an absent key is a valid config. */
const optionalKey = (name: string) =>
  z
    .string()
    .optional()
    .refine((value) => value === undefined || value.length > 0, {
      message: `${name} is set but empty — remove the line instead`,
    });

export const workerEnvSchema = z
  .object({
    GITHUB_APP_ID: z.string().min(1, "required — GitHub App > Settings > App ID"),
    GITHUB_PRIVATE_KEY_PATH: z.string().min(1, "required — path to the App's .pem private key"),
    REDIS_URL: redisUrl(),

    // Any one of these is enough: the rest are optional failovers, and a
    // deployment with only GROQ_API_KEY must still boot.
    GROQ_API_KEY: optionalKey("GROQ_API_KEY"),
    GEMINI_API_KEY: optionalKey("GEMINI_API_KEY"),
    OPENAI_API_KEY: optionalKey("OPENAI_API_KEY"),

    GROQ_MODEL: optionalKey("GROQ_MODEL"),
    GEMINI_MODEL: optionalKey("GEMINI_MODEL"),
    OPENAI_MODEL: optionalKey("OPENAI_MODEL"),

    LLM_PROVIDER_ORDER: blankToUndefined(
      z
        .string()
        .optional()
        .refine(
          (value) =>
            value === undefined ||
            orderedProviders(value).length ===
              value.split(",").filter((entry) => entry.trim()).length,
          {
            // Without this check a typo ("gemni") is silently dropped by the
            // resolver, leaving a chain of zero providers and an
            // AllProvidersFailedError on the first job instead of a typo.
            message: `must be a comma-separated list of: ${LLM_PROVIDER_IDS.join(", ")}`,
          }
        )
    ),
    LLM_TIMEOUT_MS: blankToUndefined(z.coerce.number().int().positive().optional()),
  })
  .refine((value) => value.GROQ_API_KEY || value.GEMINI_API_KEY || value.OPENAI_API_KEY, {
    message: `at least one of ${LLM_PROVIDER_IDS.map((id) => LLM_API_KEY_NAMES[id]).join(", ")} must be set — the worker has nothing to review with without one`,
  })
  .refine(
    (value) =>
      !value.LLM_PROVIDER_ORDER ||
      orderedProviders(value.LLM_PROVIDER_ORDER).some((id) => value[LLM_API_KEY_NAMES[id]]),
    {
      // Pinning the order to providers you hold no key for is a valid-looking
      // config that cannot work; catch it now, not on the first job.
      message: "LLM_PROVIDER_ORDER names providers, but none of them have an API key set",
    }
  );

export type WorkerEnv = z.infer<typeof workerEnvSchema>;
