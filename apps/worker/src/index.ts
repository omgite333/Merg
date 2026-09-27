// First import on purpose: this validates the environment and throws on a bad
// config, so it must run before the BullMQ worker starts consuming, the
// GitHub App is constructed, or any review job is processed.
import { env } from "./env";

import { Worker, Queue } from "bullmq";
import { prisma } from "@repo/database";
import { getInstallationOctokit } from "./github";
import { filterReviewableFiles } from "./context/filter";
import { buildRepositoryContext } from "./context";
import { reviewGraph } from "./graph/review.graph";
import { buildReviewSummary } from "./agents/summary.agent";
import { upsertCheckRun } from "./checkRun";
import {
  claimSession,
  completeSession,
  failSession,
  releaseForRetry,
  renewLease,
  startHeartbeat,
  WORKER_ID,
  type ReviewLease,
} from "./lease";
import { startRecoverySweep, type ReviewJobData } from "./recovery";
import type { Finding } from "./llm";

const connection = { url: env.REDIS_URL };
// Must match the queue the server produces onto in apps/server/src/queue.ts.
const REVIEW_QUEUE = "pr-review";

// Leases of jobs in flight, keyed by BullMQ job id, so the `failed` handler
// can write the terminal status under the same lease the handler held. Entries
// only leave once a job reaches a terminal state.
const heldLeases = new Map<string, ReviewLease>();

function buildCommentBody(finding: Finding): string {
  const parts: string[] = [];
  if (finding.title) parts.push(`### ${finding.title}`);
  parts.push(`**[${finding.severity.toUpperCase()} · ${finding.category}]** ${finding.message}`);
  if (finding.currentCode) parts.push(`\`\`\`\n${finding.currentCode}\n\`\`\``);
  if (finding.suggestion) parts.push(`\n**Suggested fix:**\n\`\`\`\n${finding.suggestion}\n\`\`\``);
  return parts.join("\n");
}

const worker = new Worker(
  REVIEW_QUEUE,
  async (job) => {
    const startedAt = Date.now();
    const { sessionId, installationId, owner, repo, pullNumber, commitSha, baseSha, prTitle } =
      job.data as ReviewJobData;

    // Take the lease before doing anything expensive. A second delivery of the
    // same session — BullMQ re-running a stalled job while the recovery sweep
    // re-queues it, say — loses this race and exits without touching GitHub.
    const lease = await claimSession(sessionId);
    if (!lease) {
      console.warn(`Session ${sessionId} is already claimed elsewhere — skipping job ${job.id}`);
      return;
    }
    if (job.id) heldLeases.set(job.id, lease);
    const stopHeartbeat = startHeartbeat(lease);

    let finished = false;
    try {
      const octokit = await getInstallationOctokit(installationId);
      const auth = (await octokit.auth()) as { token: string };

      // Phase 1A context engine: clone at exactly the PR head, diff from the
      // merge-base, and collect relevant PR history — reuses the App octokit.
      const context = await buildRepositoryContext({
        owner,
        repo,
        prNumber: pullNumber,
        baseSha,
        headSha: commitSha,
        authToken: auth.token,
        octokit,
      });

      const files = filterReviewableFiles(context.changes.files).filter(
        (file) => file.status !== "deleted"
      );
      const allFindings: Finding[] = [];

      for (const file of files) {
        if (!file.patch) continue;
        const result = await reviewGraph.invoke({
          filename: file.path,
          patch: file.patch,
          fileContent: file.content,
        });
        allFindings.push(...result.allFindings);
      }

      const durationSeconds = (Date.now() - startedAt) / 1000;

      const { body: summaryBody, hasBlocking } = await buildReviewSummary(allFindings, {
        prTitle: prTitle ?? `PR #${pullNumber}`,
        owner,
        repo,
        pullNumber,
        changedFiles: files.map((f) => f.path),
        durationSeconds,
      });

      // Everything above is internal work. From here on we write to someone
      // else's PR, so bail out if this worker was presumed dead while it was
      // thinking — a duplicate review is worse than no review.
      if (!(await renewLease(lease))) {
        console.error(
          `Lease on session ${sessionId} was taken over mid-review — discarding results to avoid double-posting`
        );
        return;
      }

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

      if (!(await completeSession(lease, summaryBody))) {
        console.error(`Lease on session ${sessionId} was lost before it could be marked COMPLETED`);
        return;
      }
      finished = true;

      console.log(`PR #${pullNumber} (${owner}/${repo}): posted ${allFindings.length} findings + summary in ${durationSeconds.toFixed(1)}s`);
    } finally {
      stopHeartbeat();
      // On failure the lease stays registered: the `failed` handler needs it to
      // fence the release-or-fail write it makes in a moment.
      if (finished && job.id) heldLeases.delete(job.id);
    }
  },
  { connection }
);

worker.on("failed", async (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
  if (!job?.data?.sessionId) return;

  const attempts = job.opts.attempts ?? 1;
  const lease = job.id ? heldLeases.get(job.id) : undefined;
  const lastAttempt = (job.attemptsMade ?? 1) >= attempts;

  if (lastAttempt) {
    // Out of attempts: this is the last word on the session.
    await failSession(job.data.sessionId, lease);
  } else if (lease) {
    // Attempts left. Release the session so the retry can claim it immediately
    // rather than leaving it RUNNING for the sweep to find. No lease means the
    // job died before it could claim one, so there's nothing to release.
    await releaseForRetry(lease);
  }

  // The retry will claim a fresh lease; this one is done either way.
  if (job.id) heldLeases.delete(job.id);
});

// Picks up sessions whose worker died mid-review and hands them back to the
// queue. Needs a producer connection of its own; the Worker above only consumes.
const reviewQueue = new Queue<ReviewJobData>(REVIEW_QUEUE, { connection });
startRecoverySweep(async (data, options) => {
  await reviewQueue.add("review", data, options);
});

console.log(`Worker ${WORKER_ID} listening for review jobs...`);
