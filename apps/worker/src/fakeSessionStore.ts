/**
 * A miniature in-memory stand-in for the ReviewSession queries the lease and
 * recovery code makes. It evaluates the actual `where` clauses (equality,
 * `in`, `lt`, `OR`) instead of returning scripted counts, so the tests exercise
 * the conditional writes that make leases and sweeps safe rather than
 * asserting on mocks. Test-only, like context/fixtures.ts.
 */

export type FakeRow = Record<string, unknown>;

type Call = { operation: "findMany" | "updateMany"; args: Record<string, unknown> };

let rows: FakeRow[] = [];
let calls: Call[] = [];

export function resetStore(next: FakeRow[]): void {
  rows = next.map((row) => ({ ...row }));
  calls = [];
}

export function getRows(): FakeRow[] {
  return rows;
}

export function getCalls(): Call[] {
  return calls;
}

export function session(overrides: FakeRow = {}): FakeRow {
  return {
    id: "s1",
    installationId: "0f5c1a2e-uuid",
    installation: { githubInstallId: 4242 },
    owner: "acme",
    repo: "widgets",
    pullNumber: 7,
    commitSha: "head-sha",
    baseSha: "base-sha",
    status: "QUEUED",
    summary: null,
    workerId: null,
    leaseId: null,
    heartbeatAt: null,
    attemptCount: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function matches(row: FakeRow, where: FakeRow): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === "OR") return (condition as FakeRow[]).some((branch) => matches(row, branch));

    const value = row[field];
    if (condition === null) return value === null;
    if (condition instanceof Date) {
      return value instanceof Date && value.getTime() < condition.getTime();
    }
    if (typeof condition === "object" && condition !== null) {
      const filter = condition as FakeRow;
      if ("in" in filter) return (filter.in as unknown[]).includes(value);
      if ("lt" in filter) {
        return value instanceof Date && value.getTime() < (filter.lt as Date).getTime();
      }
    }
    return value === condition;
  });
}

function project(row: FakeRow, select: FakeRow | undefined): FakeRow {
  if (!select) return { ...row };
  const picked: FakeRow = {};
  for (const field of Object.keys(select)) {
    const value = row[field];
    if (value === undefined) continue;
    // Relations come back as plain objects here; scalars as themselves.
    picked[field] = value !== null && typeof value === "object" ? { ...(value as FakeRow) } : value;
  }
  return picked;
}

function apply(row: FakeRow, data: FakeRow): void {
  for (const [field, value] of Object.entries(data)) {
    if (value !== null && typeof value === "object" && "increment" in (value as FakeRow)) {
      row[field] = ((row[field] as number) ?? 0) + ((value as FakeRow).increment as number);
    } else {
      row[field] = value;
    }
  }
}

export const prismaFake = {
  reviewSession: {
    findMany: async (args: Record<string, unknown> = {}) => {
      calls.push({ operation: "findMany", args });
      return rows
        .filter((row) => matches(row, (args.where as FakeRow) ?? {}))
        .map((row) => project(row, args.select as FakeRow | undefined));
    },
    updateMany: async (args: Record<string, unknown>) => {
      calls.push({ operation: "updateMany", args });
      const where = (args.where as FakeRow) ?? {};
      const data = args.data as FakeRow;
      const matched = rows.filter((row) => matches(row, where));
      for (const row of matched) apply(row, data);
      return { count: matched.length };
    },
  },
};
