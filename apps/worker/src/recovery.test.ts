import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { getRows, prismaFake, resetStore, session } from "./fakeSessionStore";

mock.module("@repo/database", () => ({ prisma: prismaFake }));

// Imported after the mock so recovery.ts binds to the fake store.
const { sweepStalledSessions } = await import("./recovery");

const NOW = new Date("2026-09-27T12:00:00.000Z");
const STALE = new Date(NOW.getTime() - 10 * 60_000);

/** Records what the sweep would have put on the queue. */
function recordingEnqueue() {
  const calls: { data: unknown; jobId: string }[] = [];
  const enqueue = async (data: any, options: { jobId: string }) => {
    calls.push({ data, jobId: options.jobId });
  };
  return { calls, enqueue };
}

let log: ReturnType<typeof spyOn>;
let error: ReturnType<typeof spyOn>;

beforeEach(() => {
  log = spyOn(console, "log").mockImplementation(() => {});
  error = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  log.mockRestore();
  error.mockRestore();
});

describe("sweepStalledSessions", () => {
  test("leaves a session whose worker is still heartbeating alone", async () => {
    resetStore([session({ status: "RUNNING", heartbeatAt: NOW, attemptCount: 1 })]);
    const { calls, enqueue } = recordingEnqueue();

    const result = await sweepStalledSessions(enqueue, { now: NOW });

    expect(result).toEqual({ scanned: 0, requeued: 0, failed: 0 });
    expect(calls).toHaveLength(0);
    expect(getRows()[0]!.status).toBe("RUNNING");
  });

  test("re-queues a session whose worker stopped heartbeating", async () => {
    resetStore([session({ status: "RUNNING", workerId: "dead:1", leaseId: "lease-a", heartbeatAt: STALE, attemptCount: 1 })]);
    const { calls, enqueue } = recordingEnqueue();

    const result = await sweepStalledSessions(enqueue, { now: NOW });

    expect(result).toEqual({ scanned: 1, requeued: 1, failed: 0 });
    expect(calls).toEqual([
      {
        data: {
          sessionId: "s1",
          installationId: 4242,
          owner: "acme",
          repo: "widgets",
          pullNumber: 7,
          commitSha: "head-sha",
          baseSha: "base-sha",
        },
        jobId: "recovery:s1:1",
      },
    ]);

    const row = getRows()[0]!;
    expect(row.status).toBe("RETRYING");
    expect(row.leaseId).toBeNull();
    expect(row.workerId).toBeNull();
    expect(row.heartbeatAt).toBeNull();
  });

  test("treats a RUNNING session that never heartbeated as stalled", async () => {
    resetStore([session({ status: "RUNNING", workerId: "dead:1", leaseId: "lease-a", attemptCount: 1 })]);
    const { calls, enqueue } = recordingEnqueue();

    const result = await sweepStalledSessions(enqueue, { now: NOW });

    expect(result.requeued).toBe(1);
    expect(calls).toHaveLength(1);
  });

  test("gives up once the attempt budget is spent", async () => {
    resetStore([session({ status: "RUNNING", workerId: "dead:1", leaseId: "lease-a", heartbeatAt: STALE, attemptCount: 3 })]);
    const { calls, enqueue } = recordingEnqueue();

    const result = await sweepStalledSessions(enqueue, { now: NOW });

    expect(result).toEqual({ scanned: 1, requeued: 0, failed: 1 });
    expect(calls).toHaveLength(0);
    expect(getRows()[0]!.status).toBe("FAILED");
    expect(error).toHaveBeenCalled();
  });

  test("gives up on a session with no recorded base commit — nothing to re-queue", async () => {
    resetStore([session({ status: "RUNNING", baseSha: null, heartbeatAt: STALE, attemptCount: 1 })]);
    const { calls, enqueue } = recordingEnqueue();

    const result = await sweepStalledSessions(enqueue, { now: NOW });

    expect(result).toEqual({ scanned: 1, requeued: 0, failed: 1 });
    expect(calls).toHaveLength(0);
    expect(getRows()[0]!.status).toBe("FAILED");
  });

  test("does not release a session that came back to life mid-sweep", async () => {
    resetStore([session({ status: "RUNNING", heartbeatAt: STALE, attemptCount: 1 })]);
    // The worker beats between the sweep's read and its write.
    const enqueue = async () => {
      getRows()[0]!.heartbeatAt = NOW;
    };

    const result = await sweepStalledSessions(enqueue, { now: NOW });

    expect(result).toEqual({ scanned: 1, requeued: 0, failed: 0 });
    expect(getRows()[0]!.status).toBe("RUNNING");
  });

  test("sweeps a mixed batch", async () => {
    resetStore([
      session({ id: "healthy", status: "RUNNING", heartbeatAt: NOW, attemptCount: 1 }),
      session({ id: "retryable", status: "RUNNING", heartbeatAt: STALE, attemptCount: 1 }),
      session({ id: "exhausted", status: "RUNNING", heartbeatAt: STALE, attemptCount: 3 }),
      session({ id: "queued" }),
      session({ id: "done", status: "COMPLETED" }),
    ]);
    const { calls, enqueue } = recordingEnqueue();

    const result = await sweepStalledSessions(enqueue, { now: NOW });

    expect(result).toEqual({ scanned: 2, requeued: 1, failed: 1 });
    expect(calls.map((call) => call.jobId)).toEqual(["recovery:retryable:1"]);
    expect(getRows().map((row) => row.status)).toEqual([
      "RUNNING",
      "RETRYING",
      "FAILED",
      "QUEUED",
      "COMPLETED",
    ]);
  });
});
