import { Queue } from "bullmq";
import "dotenv/config";

const connection = { url: process.env.REDIS_URL! };

export const reviewQueue = new Queue("pr-review", {
  connection,
  defaultJobOptions: {
    // Transient failures (GitHub API rate limits/hiccups, LLM timeouts)
    // are retried with exponential backoff before a session is marked FAILED.
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export const ciTriageQueue = new Queue("ci-triage", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});