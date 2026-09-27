import "dotenv/config";
import { ciWorkerEnvSchema, type CiWorkerEnv } from "./schema/env.schema";

/**
 * The CI triage worker's entire environment, read and validated once, here.
 * Every other module imports `env` from this file — never `process.env`.
 */

const result = ciWorkerEnvSchema.safeParse(process.env);

if (!result.success) {
  const details = result.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment for apps/ci-worker:\n${details}\n\n` +
      "Copy apps/ci-worker/.env.example to apps/ci-worker/.env and fill in the required values."
  );
}

export const env: CiWorkerEnv = result.data;
