import "dotenv/config";
import { serverEnvSchema, type ServerEnv } from "./schema/env.schema";

/**
 * The server's entire environment, read and validated exactly once, here.
 * Every other module imports `env` from this file — never `process.env`.
 *
 * The point is to fail at boot with a readable message instead of on the
 * first request that happens to reach a code path. A missing
 * GITHUB_WEBHOOK_SECRET used to surface as an opaque signature-verification
 * error on the first webhook; it now stops the process before Express listens.
 */

const result = serverEnvSchema.safeParse(process.env);

if (!result.success) {
  const details = result.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment for apps/server:\n${details}\n\n` +
      "Copy apps/server/.env.example to apps/server/.env and fill in the required values."
  );
}

export const env: ServerEnv = result.data;
