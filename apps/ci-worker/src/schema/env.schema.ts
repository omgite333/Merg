import { z } from "zod";

/**
 * The CI triage worker's environment schema, separate from `env.ts` so tests
 * can assert on it without triggering the boot-time parse.
 *
 * `REDIS_URL` is required here, which is a deliberate change: this process
 * used to fall back to `127.0.0.1:6379` when it was unset, so a typo in
 * `REDIS_URL` silently pointed the worker at a local Redis instead of failing.
 * That is the exact "find out mid-request" failure this schema exists to
 * prevent, and it disagreed with the other two services anyway.
 */

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

export const ciWorkerEnvSchema = z.object({
  GITHUB_APP_ID: z.string().min(1, "required — GitHub App > Settings > App ID"),
  GITHUB_PRIVATE_KEY_PATH: z.string().min(1, "required — path to the App's .pem private key"),
  REDIS_URL: redisUrl(),

  // Unlike the review worker there is no failover chain here — the triage
  // model is wired directly to Groq — so there is nothing for this key to fail
  // over to and it has to be present.
  GROQ_API_KEY: z.string().min(1, "required — the CI triage model is Groq"),
});

export type CiWorkerEnv = z.infer<typeof ciWorkerEnvSchema>;
