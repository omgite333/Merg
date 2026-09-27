import { z } from "zod";

/**
 * The server's environment schema, kept separate from `env.ts` so tests can
 * assert on validation without importing the parsed singleton — which throws
 * on a deliberately incomplete environment.
 */

/**
 * A blank value in `.env` (`PORT=`) means "unset", which is how the `|| default`
 * expressions this replaced behaved. Plain `.default()` would treat it as 0 and
 * fail validation, turning a working local setup into a boot crash.
 */
const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

/**
 * `z.url()` is not sufficient for either of these. `new URL("localhost:6379")`
 * parses happily — protocol "localhost:", empty host — so a missing `redis://`
 * or `http://` would pass validation and then fail at connect time, or
 * silently break CORS, which is the failure mode this layer exists to prevent.
 */
function requiresScheme(schemes: string[], hint: string) {
  return z.string().url().refine(
    (value) => {
      try {
        const url = new URL(value);
        return schemes.includes(url.protocol) && url.host.length > 0;
      } catch {
        // zod runs this refine even when the `.url()` check above already
        // failed, so `new URL` can still throw. Returning false keeps the
        // failure reported as a validation issue rather than a TypeError.
        return false;
      }
    },
    { message: hint }
  );
}

const redisUrl = () => requiresScheme(["redis:", "rediss:"], "must be a redis:// or rediss:// URL");

export const serverEnvSchema = z.object({
  GITHUB_WEBHOOK_SECRET: z.string().min(1, "required — GitHub App > Webhook secret"),
  AUTH_JWT_SECRET: z
    .string()
    .min(16, "must be at least 16 chars — generate one with `openssl rand -hex 32`"),
  REDIS_URL: redisUrl(),
  // `.url()` alone is not enough: see `requiresScheme` above.
  WEB_ORIGIN: blankToUndefined(
    requiresScheme(["http:", "https:"], "must be a full origin with a scheme and host, e.g. http://localhost:3000").default(
      "http://localhost:3000"
    )
  ),
  PORT: blankToUndefined(z.coerce.number().int().positive().default(8000)),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
