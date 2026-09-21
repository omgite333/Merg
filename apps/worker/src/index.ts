import { Worker } from "bullmq";
import "dotenv/config";
import { prisma } from "@repo/database";
import { getInstallationOctokit } from "./github";
import { filterReviewableFiles, getFileContext } from "./context";
import { reviewGraph } from "./graph/review.graph";
import { buildReviewSummary } from "./agents/summary.agent";
import { upsertCheckRun } from "./checkRun";
import type { Finding } from "./llm";

const connection = { url: process.env.REDIS_URL! };

function buildCommentBody(finding: Finding): string {
  const parts: string[] = [];
  if (finding.title) parts.push(`### ${finding.title}`);
  parts.push(`**[${finding.severity.toUpperCase()} · ${finding.category}]** ${finding.message}`);
  if (finding.currentCode) parts.push(`\`\`\`\n${finding.currentCode}\n\`\`\``);
  if (finding.suggestion) parts.push(`\n**Suggested fix:**\n\`\`\`\n${finding.suggestion}\n\`\`\``);
  return parts.join("\n");
}

const worker = new Worker(
  "pr-review",
  async (job) => {
    const startedAt = Date.now();
    const { sessionId, installationId, owner, repo, pullNumber, commitSha, prTitle } = job.data;

    await prisma.reviewSession.update({ where: { id: sessionId }, data: { status: "RUNNING" } });

    const octokit = await getInstallationOctokit(installationId);

    const { data: rawFiles } = await octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
      { owner, repo, pull_number: pullNumber }
    );

    const files = filterReviewableFiles(rawFiles);
    const allFindings: Finding[] = [];

    for (const file of files) {
      if (!file.patch) continue;
      const fileContent = await getFileContext(octokit, owner, repo, file.filename, commitSha);
      const result = await reviewGraph.invoke({ filename: file.filename, patch: file.patch, fileContent });
      allFindings.push(...result.allFindings);
    }

    const durationSeconds = (Date.now() - startedAt) / 1000;

    const { body: summaryBody, hasBlocking } = await buildReviewSummary(allFindings, {
      prTitle: prTitle ?? `PR #${pullNumber}`,
      owner,
      repo,
      pullNumber,
      changedFiles: files.map((f) => f.filename),
      durationSeconds,
    });

    const commentRecords: { finding: Finding; githubCommentId?: number | bigint }[] = [];

    for (const finding of allFindings) {
      let githubCommentId: number | bigint | undefined;
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
            body: buildCommentBody(finding),
          }
        );
        githubCommentId = data.id;
      } catch (err: any) {
        console.error(`Failed to post comment on ${finding.file}:${finding.line}`, err.message);
      }
      commentRecords.push({ finding, githubCommentId });
    }

    try {
      const event = hasBlocking ? "REQUEST_CHANGES" : allFindings.length === 0 ? "APPROVE" : "COMMENT";
      await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitSha,
        body: summaryBody,
        event,
      });
    } catch (err: any) {
      console.error(`Failed to post review summary for PR #${pullNumber}`, err.message);
    }

    await upsertCheckRun({
      octokit,
      owner,
      repo,
      headSha: commitSha,
      findings: allFindings,
      reviewBody: summaryBody,
    });

    for (const { finding, githubCommentId } of commentRecords) {
      await prisma.reviewComment.create({
        data: {
          sessionId,
          file: finding.file,
          line: finding.line,
          severity: finding.severity,
          category: finding.category,
          title: finding.title ?? null,
          message: finding.message,
          currentCode: finding.currentCode ?? null,
          suggestion: finding.suggestion ?? null,
          blocking: Boolean(finding.blocking),
          githubCommentId: githubCommentId ? BigInt(githubCommentId) : undefined,
        },
      });
    }

    await prisma.reviewSession.update({
      where: { id: sessionId },
      data: { status: "COMPLETED", summary: summaryBody },
    });

    console.log(`PR #${pullNumber} (${owner}/${repo}): posted ${allFindings.length} findings + summary in ${durationSeconds.toFixed(1)}s`);
  },
  { connection }
);

worker.on("failed", async (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
  if (job?.data?.sessionId) {
    await prisma.reviewSession.update({ where: { id: job.data.sessionId }, data: { status: "FAILED" } });
  }
});

console.log("Worker listening for review jobs...");