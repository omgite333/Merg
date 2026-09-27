import "dotenv/config";
import { workerEnvSchema, type WorkerEnv } from "./schema/env.schema";

/**
 * The review worker's entire environment, read and validated once, here.
 * Every other module imports `env` from this file — never `process.env`.
 *
 * The worker used to build its GitHub App and its BullMQ connection at module
 * load with `process.env.X!` assertions, so a missing key was not discovered
 * until the first job arrived, and the failure was an opaque Octokit or Redis
 * error rather than "GITHUB_APP_ID is not set".
 */

const result = workerEnvSchema.safeParse(process.env);

if (!result.success) {
  const details = result.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment for apps/worker:\n${details}\n\n` +
      "Copy apps/worker/.env.example to apps/worker/.env and fill in the required values."
  );
}

export const env: WorkerEnv = result.data;
