import { Worker } from "bullmq";
import "dotenv/config";
import { prisma } from "@repo/database";
import { getInstallationOctokit } from "./github";
import { getFailedJobLogs } from "./logs";
import { triageFailure } from "./triage";

const connection = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL }
  : { host: "127.0.0.1", port: 6379 };

const worker = new Worker(
  "ci-triage",
  async (job) => {
    const { ciRunId, installationId, owner, repo, workflowRunId, pullNumber } = job.data;

    await prisma.cIRun.update({ where: { id: ciRunId }, data: { status: "RUNNING" } });

    const octokit = await getInstallationOctokit(installationId);
    const failedJobs = await getFailedJobLogs(octokit, owner, repo, workflowRunId);
    const ciRun = await prisma.cIRun.findUniqueOrThrow({ where: { id: ciRunId } });

    if (failedJobs.length === 0) {
      await prisma.cIRun.update({
        where: { id: ciRunId },
        data: {
          status: "COMPLETED",
          classification: "UNKNOWN",
          summary: "No failing job logs could be retrieved for this run.",
        },
      });
      console.log(`Workflow run ${workflowRunId} (${owner}/${repo}): no failed job logs found`);
      return;
    }

    const { classification, summary } = await triageFailure(ciRun.workflowName, failedJobs);
    const body = `**Merg CI Triage — ${classification.replaceAll("_", " ")}**\n\n${summary}`;

    let postedCommentId: bigint | undefined;

    try {
      if (pullNumber) {
        const { data } = await octokit.request(
          "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
          { owner, repo, issue_number: pullNumber, body }
        );
        postedCommentId = BigInt(data.id);
      } else {
        // No open PR to comment on (fork PR, or a push with no PR) —
        // fall back to a check run on the commit itself. Requires the
        // "Checks: Read & write" permission, same as the PR review checks.
        await octokit.request("POST /repos/{owner}/{repo}/check-runs", {
          owner,
          repo,
          name: "Merg CI Triage",
          head_sha: ciRun.headSha,
          status: "completed",
          conclusion: "neutral",
          output: { title: classification.replaceAll("_", " "), summary },
        });
      }
    } catch (err: any) {
      console.error(`Failed to post CI triage result for ${owner}/${repo} run ${workflowRunId}:`, err.message);
    }

    await prisma.cIRun.update({
      where: { id: ciRunId },
      data: { status: "COMPLETED", classification, summary, postedCommentId },
    });

    console.log(`Workflow run ${workflowRunId} (${owner}/${repo}): ${classification}`);
  },
  { connection }
);

worker.on("error", (error) => {
  console.error("Redis queue error:", error.message);
});

worker.on("failed", async (job, err) => {
  console.error(`CI triage job ${job?.id} failed:`, err.message);
  const exhausted = job && job.attemptsMade >= (job.opts.attempts ?? 1);
  if (exhausted && job?.data?.ciRunId) {
    await prisma.cIRun.update({
      where: { id: job.data.ciRunId },
      data: { status: "FAILED" },
    });
  }
});

console.log("CI triage worker listening for jobs...");