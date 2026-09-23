import { ChatGroq } from "@langchain/groq";
import "dotenv/config";
import type { FailedJob } from "./logs";
import { invokeWithRetry } from "./rateLimit";

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "openai/gpt-oss-120b",
  temperature: 0,
  maxTokens: 1024,
});

export type Classification = "BUILD_ERROR" | "TEST_FAILURE" | "LINT" | "TIMEOUT" | "FLAKY" | "UNKNOWN";
export type TriageResult = { classification: Classification; summary: string };

const SYSTEM_PROMPT = `You are a CI triage assistant. You'll be given the failing log excerpt(s) from one or more GitHub Actions jobs in a workflow run. Classify the failure and explain the likely root cause in 2-3 sentences, written for a developer who hasn't looked at the logs yet.

Classify as exactly one of: BUILD_ERROR, TEST_FAILURE, LINT, TIMEOUT, FLAKY, UNKNOWN.
- FLAKY: the error looks like a network blip, race condition, or intermittent infra issue rather than a real code problem.
- UNKNOWN: you genuinely can't tell from the excerpt.

Respond with ONLY valid JSON, no markdown fences: {"classification": "...", "summary": "..."}`;

export async function triageFailure(workflowName: string, jobs: FailedJob[]): Promise<TriageResult> {
  const jobsText = jobs.map((job) => `--- Job: ${job.name} ---\n${job.logExcerpt}`).join("\n\n");

  const response = await invokeWithRetry(
    () =>
      model.invoke([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Workflow: ${workflowName}\n\n${jobsText}` },
      ]),
    `ci-triage:${workflowName}`
  );

  try {
    return JSON.parse(response.content as string) as TriageResult;
  } catch {
    console.error("Triage agent failed to parse output:", response.content);
    return {
      classification: "UNKNOWN",
      summary:
        "Could not automatically determine the cause of this failure — check the workflow run logs directly.",
    };
  }
}