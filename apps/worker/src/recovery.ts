import { prisma, type Prisma } from "@repo/database";
import { LEASE_TIMEOUT_MS, MAX_REVIEW_ATTEMPTS } from "./lease";

/**
 * BullMQ already re-delivers a job whose worker died (the lock on it expires
 * and the job is re-run), but the database has no idea: the session stays
 * RUNNING forever, so the dashboard shows a review that will never finish and
 * nothing ever retries it if the queue entry itself is gone.
 *
 * This sweep is that missing half. Every SWEEP_INTERVAL_MS it looks for RUNNING
 * sessions whose heartbeat has gone quiet — the signature of a dead or wedged
 * worker — and hands them back to the queue, bounded by MAX_REVIEW_ATTEMPTS so
 * a job that reliably kills its worker eventually stops burning CI minutes.
 */

export const SWEEP_INTERVAL_MS = 30_000;

export type ReviewJobData = {
  sessionId: string;
  /** GitHub's installation id, not our Installation row id — this is what the App octokit is built from. */
  installationId: number;
  owner: string;
  repo: string;
  pullNumber: number;
  commitSha: string;
  baseSha: string;
  /** GitHub's PR title — nullable in the webhook payload, and absent on recovery re-queues. */
  prTitle?: string | null;
};

export type EnqueueReview = (data: ReviewJobData, options: { jobId: string }) => Promise<void>;

export type SweepResult = {
  /** Sessions taken off a dead worker and put back on the queue. */
  requeued: number;
  /** Sessions abandoned for good (out of attempts, or not recoverable). */
  failed: number;
  /** RUNNING sessions with a quiet heartbeat. */
  scanned: number;
};

/**
 * Scans for stalled sessions once. Safe to run concurrently on several workers:
 * every status write is conditional on the session still looking stalled, so
 * at most one of them wins, and the others count zero and move on.
 */
export async function sweepStalledSessions(
  enqueue: EnqueueReview,
  options: { now?: Date; leaseTimeoutMs?: number } = {}
): Promise<SweepResult> {
  const cutoff = new Date(
    (options.now ?? new Date()).getTime() - (options.leaseTimeoutMs ?? LEASE_TIMEOUT_MS)
  );
  // A session is stalled when nothing has claimed a heartbeat for it, or when
  // its last heartbeat predates the cutoff. Matches the claim CAS below.
  const stalledWhere: Prisma.ReviewSessionWhereInput = {
    status: "RUNNING",
    OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: cutoff } }],
  };

  const stalled = await prisma.reviewSession.findMany({
    where: stalledWhere,
    select: {
      id: true,
      installation: { select: { githubInstallId: true } },
      owner: true,
      repo: true,
      pullNumber: true,
      commitSha: true,
      baseSha: true,
      attemptCount: true,
      workerId: true,
    },
  });

  const result: SweepResult = { requeued: 0, failed: 0, scanned: stalled.length };

  for (const session of stalled) {
    // Nothing to re-queue if this was its last attempt, or if the session
    // predates baseSha being recorded (before it, a retry had nothing to
    // clone) — those go straight to FAILED instead of looping forever.
    const exhausted = session.attemptCount >= MAX_REVIEW_ATTEMPTS;
    const giveUp = exhausted || !session.baseSha;

    if (!exhausted && session.baseSha) {
      // Enqueue before flipping the status: a job that makes it onto the queue
      // while the status write loses its race is harmless (the job finds the
      // session unclaimable and exits), whereas a status flip that never gets
      // its job would strand the session in RETRYING forever.
      await enqueue(
        {
          sessionId: session.id,
          installationId: session.installation.githubInstallId,
          owner: session.owner,
          repo: session.repo,
          pullNumber: session.pullNumber,
          commitSha: session.commitSha,
          baseSha: session.baseSha,
        },
        { jobId: `recovery:${session.id}:${session.attemptCount}` }
      );
    }

    const released = await prisma.reviewSession.updateMany({
      // Re-assert the id we looked at alongside the staleness check, so a
      // session that heartbeated (or a session another sweep already took
      // over) makes this a no-op instead of a stray write.
      where: { id: session.id, ...stalledWhere },
      data: {
        status: giveUp ? "FAILED" : "RETRYING",
        workerId: null,
        leaseId: null,
        heartbeatAt: null,
      },
    });
    if (released.count === 0) continue;

    if (giveUp) {
      result.failed += 1;
      const reason = exhausted ? `out of attempts after ${session.attemptCount}` : "no base commit recorded";
      console.error(
        `Session ${session.id} (${session.owner}/${session.repo}#${session.pullNumber}) lost its worker ` +
          `(${session.workerId ?? "unknown"}) and cannot be recovered: ${reason}`
      );
    } else {
      result.requeued += 1;
      console.log(
        `Session ${session.id} (${session.owner}/${session.repo}#${session.pullNumber}) lost its worker ` +
          `(${session.workerId ?? "unknown"}) — re-queued as attempt ${session.attemptCount + 1}/${MAX_REVIEW_ATTEMPTS}`
      );
    }
  }

  return result;
}

/**
 * Runs the sweep on an interval, starting with one immediately: a worker that
 * just restarted is exactly when a pile of orphaned sessions is waiting.
 */
export function startRecoverySweep(
  enqueue: EnqueueReview,
  intervalMs: number = SWEEP_INTERVAL_MS
): () => void {
  const tick = () => {
    sweepStalledSessions(enqueue)
      .then(({ requeued, failed }) => {
        if (requeued || failed) console.log(`Recovery sweep: ${requeued} re-queued, ${failed} failed`);
      })
      .catch((err) => console.error("Review recovery sweep failed:", err));
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  // The BullMQ connection keeps the process alive; the sweep shouldn't.
  timer.unref?.();

  return () => clearInterval(timer);
}
