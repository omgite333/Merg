import { Worker } from "bullmq";
import "dotenv/config";
import { prisma } from "@repo/database";
import { getInstallationOctokit } from "./github";
import { filterReviewableFiles, getFileContext } from "./context";
import { reviewGraph } from "./graph/review.graph";

const connection = { url: process.env.REDIS_URL! };

const worker = new Worker(
  "pr-review",
  async (job) => {
    const { sessionId, installationId, owner, repo, pullNumber, commitSha } = job.data;

    await prisma.reviewSession.update({
      where: { id: sessionId },
      data: { status: "RUNNING" },
    });

    const octokit = await getInstallationOctokit(installationId);

    const { data: rawFiles } = await octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
      { owner, repo, pull_number: pullNumber }
    );

    const files = filterReviewableFiles(rawFiles);

    let totalFindings = 0;

    for (const file of files) {
      if (!file.patch) continue; // binary or too large — GitHub omits patch

      const fileContent = await getFileContext(octokit, owner, repo, file.filename, commitSha);

      const result = await reviewGraph.invoke({
        filename: file.filename,
        patch: file.patch,
        fileContent,
      });

      for (const finding of result.allFindings) {
        let githubCommentId: bigint | undefined;

        try {
          const { data } = await octokit.request(
            "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments",
            {
              owner,
              repo,
              pull_number: pullNumber,
              commit_id: commitSha,
              path: finding.file,
              line: finding.line,
              side: "RIGHT",
              body: `**[${finding.severity.toUpperCase()} \u00b7 ${finding.category}]** ${finding.message}`,
            }
          );
          githubCommentId = BigInt(data.id);
        } catch (err: any) {
          // GitHub rejects comments on lines outside the diff hunk — log and
          // move on instead of failing the whole job.
          console.error(`Failed to post comment on ${finding.file}:${finding.line}`, err.message);
        }

        await prisma.reviewComment.create({
          data: {
            sessionId,
            file: finding.file,
            line: finding.line,
            severity: finding.severity,
            category: finding.category,
            message: finding.message,
            githubCommentId,
          },
        });

        totalFindings += 1;
      }
    }

    await prisma.reviewSession.update({
      where: { id: sessionId },
      data: { status: "COMPLETED" },
    });

    console.log(`PR #${pullNumber} (${owner}/${repo}): posted ${totalFindings} findings`);
  },
  { connection }
);

worker.on("failed", async (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
  if (job?.data?.sessionId) {
    await prisma.reviewSession.update({
      where: { id: job.data.sessionId },
      data: { status: "FAILED" },
    });
  }
});

console.log("Worker listening for review jobs...");