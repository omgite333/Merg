import { beforeEach, describe, expect, mock, test } from "bun:test";
import { getRows, prismaFake, resetStore, session } from "./fakeSessionStore";

mock.module("@repo/database", () => ({ prisma: prismaFake }));

// Imported after the mock so lease.ts binds to the fake store.
const { claimSession, completeSession, failSession, releaseForRetry, renewLease } = await import("./lease");

describe("claimSession", () => {
  beforeEach(() => {
    resetStore([session()]);
  });

  test("takes a queued session, stamping the lease and counting the attempt", async () => {
    const lease = await claimSession("s1", "worker-a");

    expect(lease).not.toBeNull();
    const row = getRows()[0]!;
    expect(row.status).toBe("RUNNING");
    expect(row.workerId).toBe("worker-a");
    expect(row.leaseId).toBe(lease!.leaseId);
    expect(row.heartbeatAt).toBeInstanceOf(Date);
    expect(row.attemptCount).toBe(1);
  });

  test("refuses a session another worker already owns", async () => {
    resetStore([
      session({ status: "RUNNING", workerId: "worker-a", leaseId: "lease-a", heartbeatAt: new Date() }),
    ]);

    expect(await claimSession("s1", "worker-b")).toBeNull();
    expect(getRows()[0]!.workerId).toBe("worker-a");
  });

  test("picks up a session the recovery sweep put back in RETRYING", async () => {
    resetStore([session({ status: "RETRYING", attemptCount: 1 })]);

    const lease = await claimSession("s1", "worker-b");

    expect(lease).not.toBeNull();
    expect(getRows()[0]!.attemptCount).toBe(2);
  });

  test("refuses a session that is already finished", async () => {
    resetStore([session({ status: "COMPLETED" })]);

    expect(await claimSession("s1", "worker-a")).toBeNull();
  });
});

describe("lease fencing", () => {
  beforeEach(() => {
    resetStore([session()]);
  });

  /** What the recovery sweep leaves behind: a live-looking row on a new worker. */
  async function loseLeaseTo(workerId: string) {
    const stale = (await claimSession("s1", workerId))!;
    resetStore([
      session({ status: "RUNNING", workerId: "worker-b", leaseId: "lease-b", heartbeatAt: new Date(), attemptCount: 1 }),
    ]);
    return stale;
  }

  test("a worker that lost its lease can't refresh the heartbeat", async () => {
    const stale = await loseLeaseTo("worker-a");

    expect(await renewLease(stale)).toBe(false);
    // The write was rejected, so the live worker's timestamp stands.
    expect(getRows()[0]!.leaseId).toBe("lease-b");
  });

  test("a worker that lost its lease can't mark the session completed", async () => {
    const stale = await loseLeaseTo("worker-a");

    expect(await completeSession(stale, "Looks good to merge!")).toBe(false);
    const row = getRows()[0]!;
    expect(row.status).toBe("RUNNING");
    expect(row.summary).toBeNull();
  });

  test("completing clears the lease so nothing can complete it twice", async () => {
    const lease = (await claimSession("s1", "worker-a"))!;

    expect(await completeSession(lease, "Looks good to merge!")).toBe(true);
    const row = getRows()[0]!;
    expect(row.status).toBe("COMPLETED");
    expect(row.summary).toBe("Looks good to merge!");
    expect(row.leaseId).toBeNull();
    expect(row.workerId).toBeNull();
    expect(row.heartbeatAt).toBeNull();

    expect(await completeSession(lease, "…again")).toBe(false);
    expect(getRows()[0]!.summary).toBe("Looks good to merge!");
  });
});

describe("releaseForRetry", () => {
  beforeEach(() => {
    resetStore([session()]);
  });

  test("hands the session back so the next attempt can claim it", async () => {
    const lease = (await claimSession("s1", "worker-a"))!;

    expect(await releaseForRetry(lease)).toBe(true);
    const row = getRows()[0]!;
    expect(row.status).toBe("RETRYING");
    expect(row.leaseId).toBeNull();
    expect(row.workerId).toBeNull();
    expect(row.attemptCount).toBe(1);

    // And the retry picks up where this attempt left off, attempt 2.
    expect((await claimSession("s1", "worker-b"))!.workerId).toBe("worker-b");
    expect(getRows()[0]!.attemptCount).toBe(2);
  });

  test("a worker that lost its lease can't release the attempt that replaced it", async () => {
    const stale = (await claimSession("s1", "worker-a"))!;
    resetStore([
      session({ status: "RUNNING", workerId: "worker-b", leaseId: "lease-b", attemptCount: 2 }),
    ]);

    expect(await releaseForRetry(stale)).toBe(false);
    expect(getRows()[0]!.status).toBe("RUNNING");
  });
});

describe("failSession", () => {
  beforeEach(() => {
    resetStore([session()]);
  });

  test("fails the session under the lease that owned it", async () => {
    const lease = (await claimSession("s1", "worker-a"))!;

    expect(await failSession("s1", lease)).toBe(true);
    const row = getRows()[0]!;
    expect(row.status).toBe("FAILED");
    expect(row.leaseId).toBeNull();
    expect(row.heartbeatAt).toBeNull();
  });

  test("a dead worker can't fail the attempt that replaced it", async () => {
    const stale = (await claimSession("s1", "worker-a"))!;
    resetStore([
      session({ status: "RUNNING", workerId: "worker-b", leaseId: "lease-b", attemptCount: 2 }),
    ]);

    expect(await failSession("s1", stale)).toBe(false);
    expect(getRows()[0]!.status).toBe("RUNNING");
  });

  test("a job that died before claiming still fails the session", async () => {
    expect(await failSession("s1")).toBe(true);
    expect(getRows()[0]!.status).toBe("FAILED");
  });

  test("never overwrites a session that already finished", async () => {
    resetStore([session({ status: "COMPLETED" })]);

    expect(await failSession("s1")).toBe(false);
    expect(getRows()[0]!.status).toBe("COMPLETED");
  });
});
