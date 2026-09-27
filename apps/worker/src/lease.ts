import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { prisma } from "@repo/database";

/**
 * A review is only trustworthy while a worker is provably still working on it.
 * The worker process claims the session, refreshes `heartbeatAt` on a timer,
 * and writes the terminal status under the same `leaseId` it claimed with.
 *
 * If the process is killed, the container is evicted, or the box loses
 * network, the heartbeats stop. `recovery.ts` then notices the session is
 * RUNNING past `LEASE_TIMEOUT_MS` and re-queues it. The `leaseId` acts as a
 * fencing token: a worker that comes back to life (and gets a late heartbeat
 * or terminal write in) matches zero rows, so it can never clobber the newer
 * attempt that took over.
 */

/** Stable for the life of the process; makes an orphaned lease traceable to a host. */
export const WORKER_ID = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

export const HEARTBEAT_INTERVAL_MS = 15_000;
/** Six missed heartbeats before a RUNNING session is presumed dead. */
export const LEASE_TIMEOUT_MS = 90_000;
/** Recovery attempts, kept in step with the queue's own `attempts` option. */
export const MAX_REVIEW_ATTEMPTS = 3;

export const SESSION_STATUSES = ["QUEUED", "RUNNING", "RETRYING", "COMPLETED", "FAILED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * Statuses a worker may pick a session up from: the server seeds QUEUED from
 * the webhook, and both the recovery sweep and a failed attempt set RETRYING.
 * RUNNING is deliberately absent — that row is owned by whoever holds its lease.
 */
const CLAIMABLE: SessionStatus[] = ["QUEUED", "RETRYING"];

export type ReviewLease = {
  sessionId: string;
  leaseId: string;
  workerId: string;
};

/**
 * Takes ownership of a session in one conditional write, so two workers
 * racing on the same row can't both win. Returns null when the session isn't
 * claimable (already running elsewhere, or already finished) — the caller
 * should treat that as "someone else has this one" and do no work.
 */
export async function claimSession(
  sessionId: string,
  workerId: string = WORKER_ID
): Promise<ReviewLease | null> {
  const leaseId = randomUUID();

  const claimed = await prisma.reviewSession.updateMany({
    where: { id: sessionId, status: { in: CLAIMABLE } },
    data: {
      status: "RUNNING",
      workerId,
      leaseId,
      heartbeatAt: new Date(),
      attemptCount: { increment: 1 },
    },
  });

  if (claimed.count === 0) return null;
  return { sessionId, leaseId, workerId };
}

/**
 * Refreshes the lease's heartbeat. Returns false once the lease has been taken
 * over by another worker — nothing is written in that case, which is how a
 * worker that was presumed dead learns to stand down.
 */
export async function renewLease(lease: ReviewLease): Promise<boolean> {
  const owned = await prisma.reviewSession.updateMany({
    where: { id: lease.sessionId, leaseId: lease.leaseId },
    data: { heartbeatAt: new Date() },
  });
  return owned.count > 0;
}

/**
 * Heartbeats until the returned stop function is called. Failures are logged
 * rather than thrown: a blip shouldn't kill a review that is otherwise fine,
 * and the next beat (or the recovery sweep) sorts it out.
 */
export function startHeartbeat(lease: ReviewLease, intervalMs: number = HEARTBEAT_INTERVAL_MS): () => void {
  const timer = setInterval(() => {
    renewLease(lease).catch((err) => {
      console.error(`Heartbeat failed for session ${lease.sessionId}:`, err);
    });
  }, intervalMs);

  return () => clearInterval(timer);
}

/** Terminal write for a finished review. Returns false if the lease was lost mid-review. */
export async function completeSession(lease: ReviewLease, summary: string | null): Promise<boolean> {
  const completed = await prisma.reviewSession.updateMany({
    where: { id: lease.sessionId, leaseId: lease.leaseId },
    data: {
      status: "COMPLETED",
      summary,
      workerId: null,
      leaseId: null,
      heartbeatAt: null,
    },
  });

  return completed.count > 0;
}

/**
 * Hands a session back to the queue after an attempt threw, so BullMQ's own
 * retry can claim it straight away instead of the session sitting RUNNING
 * until the recovery sweep notices. Fenced by leaseId like every other write
 * here: a worker that lost the lease can't release someone else's attempt.
 */
export async function releaseForRetry(lease: ReviewLease): Promise<boolean> {
  const released = await prisma.reviewSession.updateMany({
    where: { id: lease.sessionId, leaseId: lease.leaseId, status: "RUNNING" },
    data: { status: "RETRYING", workerId: null, leaseId: null, heartbeatAt: null },
  });

  return released.count > 0;
}

/**
 * Terminal write for a review that exhausted its attempts (or blew up before
 * it could claim one). When the lease is known we match on it; when the job
 * died before claiming, the status guard is what stops this from clobbering a
 * session some other worker is already retrying.
 */
export async function failSession(sessionId: string, lease?: ReviewLease | null): Promise<boolean> {
  const failed = await prisma.reviewSession.updateMany({
    where: {
      id: sessionId,
      status: { in: [...CLAIMABLE, "RUNNING"] },
      ...(lease ? { leaseId: lease.leaseId } : {}),
    },
    data: {
      status: "FAILED",
      workerId: null,
      leaseId: null,
      heartbeatAt: null,
    },
  });

  return failed.count > 0;
}
