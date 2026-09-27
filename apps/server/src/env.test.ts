import { describe, expect, test } from "bun:test";
import { serverEnvSchema as schema } from "./schema/env.schema";

/**
 * The point of `env.ts` is that these fail *at boot* rather than on the first
 * request, so they are asserted directly against the schema. The parsed
 * `env` singleton is deliberately not imported — it would throw on the
 * deliberately incomplete inputs below.
 */

const COMPLETE = {
  GITHUB_WEBHOOK_SECRET: "whsec_test",
  AUTH_JWT_SECRET: "a".repeat(32),
  REDIS_URL: "redis://localhost:6379",
};

describe("server env", () => {
  test("accepts a complete environment", () => {
    const result = schema.safeParse(COMPLETE);
    expect(result.success).toBe(true);
  });

  test("strips variables it does not own, so a noisy shell is fine", () => {
    const result = schema.safeParse({ ...COMPLETE, PATH: "/usr/bin", HOME: "/root" });
    expect(result.success).toBe(true);
    expect(result.success && "PATH" in result.data).toBe(false);
  });

  test("reports every missing variable at once, not just the first", () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("GITHUB_WEBHOOK_SECRET");
    expect(paths).toContain("AUTH_JWT_SECRET");
    expect(paths).toContain("REDIS_URL");
  });

  test("rejects a JWT secret too short to be a secret", () => {
    const result = schema.safeParse({ ...COMPLETE, AUTH_JWT_SECRET: "short" });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain("at least 16");
  });

  test("rejects a malformed REDIS_URL", () => {
    expect(schema.safeParse({ ...COMPLETE, REDIS_URL: "not a url" }).success).toBe(false);
  });

  test("rejects a REDIS_URL missing its scheme", () => {
    // `new URL("localhost:6379")` parses (protocol "localhost:", empty host),
    // so this typo would otherwise boot fine and fail at connect time.
    const result = schema.safeParse({ ...COMPLETE, REDIS_URL: "localhost:6379" });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain("redis://");
  });

  test("accepts a rediss:// URL with credentials", () => {
    const result = schema.safeParse({ ...COMPLETE, REDIS_URL: "rediss://user:pw@cache:6380" });
    expect(result.success).toBe(true);
  });

  test("applies defaults for the optional variables", () => {
    const result = schema.safeParse(COMPLETE);
    expect(result.success && result.data.PORT).toBe(8000);
    expect(result.success && result.data.WEB_ORIGIN).toBe("http://localhost:3000");
  });

  test("treats a blank optional variable as unset, not as zero", () => {
    // `PORT=` in a .env used to fall back to 8000 via `PORT || 8000`. Plain
    // .default() would coerce "" to 0 and fail the positive() check, turning
    // a working setup into a boot crash.
    const result = schema.safeParse({ ...COMPLETE, PORT: "", WEB_ORIGIN: "" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.PORT).toBe(8000);
    expect(result.success && result.data.WEB_ORIGIN).toBe("http://localhost:3000");
  });

  test("rejects a non-numeric or non-positive PORT", () => {
    expect(schema.safeParse({ ...COMPLETE, PORT: "http" }).success).toBe(false);
    expect(schema.safeParse({ ...COMPLETE, PORT: "-1" }).success).toBe(false);
    expect(schema.safeParse({ ...COMPLETE, PORT: "8080" }).success).toBe(true);
  });

  test("rejects a WEB_ORIGIN that is not a full origin", () => {
    // Forgetting `http://` is a common paste error and `z.url()` alone lets it
    // through, which would break CORS at runtime rather than at boot.
    expect(schema.safeParse({ ...COMPLETE, WEB_ORIGIN: "localhost:3000" }).success).toBe(false);
    expect(schema.safeParse({ ...COMPLETE, WEB_ORIGIN: "app.example.com" }).success).toBe(false);
    expect(schema.safeParse({ ...COMPLETE, WEB_ORIGIN: "https://app.example.com" }).success).toBe(true);
  });
});
