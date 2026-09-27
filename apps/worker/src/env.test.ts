import { describe, expect, test } from "bun:test";
import { workerEnvSchema as schema } from "./schema/env.schema";

/**
 * Asserted against the schema rather than the parsed `env` singleton, which
 * would throw on the deliberately incomplete inputs below.
 */

const COMPLETE = {
  GITHUB_APP_ID: "12345",
  GITHUB_PRIVATE_KEY_PATH: "./github-app-private-key.pem",
  REDIS_URL: "redis://localhost:6379",
  GROQ_API_KEY: "gsk_test",
};

describe("worker env", () => {
  test("accepts a Groq-only environment", () => {
    expect(schema.safeParse(COMPLETE).success).toBe(true);
  });

  test("accepts any single provider's key in place of Groq", () => {
    for (const key of ["GEMINI_API_KEY", "OPENAI_API_KEY"]) {
      const { GROQ_API_KEY: _groq, ...rest } = COMPLETE;
      const result = schema.safeParse({ ...rest, [key]: "test-key" });
      expect(result.success).toBe(true);
    }
  });

  test("fails at boot when no provider key is set at all", () => {
    const { GROQ_API_KEY: _groq, ...withoutKeys } = COMPLETE;
    const result = schema.safeParse(withoutKeys);
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain("GROQ_API_KEY");
  });

  test("treats a key that is set but empty as a mistake, not as absent", () => {
    const result = schema.safeParse({ ...COMPLETE, GROQ_API_KEY: "", GEMINI_API_KEY: "k" });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain("remove the line");
  });

  test("rejects a misspelled provider in LLM_PROVIDER_ORDER", () => {
    const result = schema.safeParse({ ...COMPLETE, LLM_PROVIDER_ORDER: "gemni,groq" });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain("groq, gemini, openai");
  });

  test("accepts a valid LLM_PROVIDER_ORDER in any case", () => {
    for (const order of ["gemini,groq,openai", "GROQ", " gemini , groq "]) {
      expect(schema.safeParse({ ...COMPLETE, LLM_PROVIDER_ORDER: order }).success).toBe(true);
    }
  });

  test("rejects an order that names only providers without keys", () => {
    const result = schema.safeParse({ ...COMPLETE, LLM_PROVIDER_ORDER: "gemini,openai" });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain("none of them have an API key");
  });

  test("coerces LLM_TIMEOUT_MS and leaves it undefined when absent or blank", () => {
    const set = schema.safeParse({ ...COMPLETE, LLM_TIMEOUT_MS: "1500" });
    expect(set.success).toBe(true);
    expect(set.success && set.data.LLM_TIMEOUT_MS).toBe(1500);

    const absent = schema.safeParse(COMPLETE);
    expect(absent.success && absent.data.LLM_TIMEOUT_MS).toBeUndefined();

    const blank = schema.safeParse({ ...COMPLETE, LLM_TIMEOUT_MS: "" });
    expect(blank.success).toBe(true);
    expect(blank.success && blank.data.LLM_TIMEOUT_MS).toBeUndefined();
  });

  test("rejects a non-positive LLM_TIMEOUT_MS", () => {
    expect(schema.safeParse({ ...COMPLETE, LLM_TIMEOUT_MS: "0" }).success).toBe(false);
  });

  test("reports missing infrastructure vars even when a key is present", () => {
    const result = schema.safeParse({ GROQ_API_KEY: "gsk_test" });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("GITHUB_APP_ID");
    expect(paths).toContain("GITHUB_PRIVATE_KEY_PATH");
    expect(paths).toContain("REDIS_URL");
  });
});
