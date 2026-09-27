import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";

/**
 * Wire-format contract tests. These assert the exact JSON bodies the dashboard
 * in apps/web/src/types/dashboard.ts depends on. They are deliberately written
 * against `apiRouter` only, so they hold across the routes/controllers/schema
 * layering — if a mapper or an envelope changes shape, these fail.
 */

const SESSION_DATE = new Date("2026-01-02T03:04:05.000Z");
const COMMENT_DATE = new Date("2026-01-02T04:05:06.000Z");

const USER = {
  id: "user-1",
  login: "octocat",
  installations: [{ id: "inst-1" }],
};

const SESSION = {
  id: "sess-1",
  installationId: "inst-1",
  owner: "acme",
  repo: "widgets",
  pullNumber: 42,
  commitSha: "abc123",
  status: "COMPLETED",
  summary: "Looks good to merge!",
  createdAt: SESSION_DATE,
  // Two comments in the same file so `filesReviewed` dedupes to 1, and a second
  // comment with unrecognised severity/category to pin the fallbacks.
  comments: [
    {
      id: "c1",
      file: "src/a.ts",
      line: 10,
      severity: "high",
      category: "security",
      title: "Unsanitised input",
      message: "User input reaches exec() unescaped.",
      suggestion: "Use execFile.",
      githubCommentId: 555n,
      createdAt: COMMENT_DATE,
    },
    {
      id: "c2",
      file: "src/a.ts",
      line: 20,
      severity: "nonsense",
      category: "nonsense",
      title: null,
      message: "Something is off.",
      suggestion: null,
      githubCommentId: null,
      createdAt: COMMENT_DATE,
    },
  ],
};

const CI_RUN = {
  id: "run-1",
  installationId: "inst-1",
  owner: "acme",
  repo: "widgets",
  workflowRunId: 999n,
  workflowName: "CI",
  headSha: "def456",
  pullNumber: 42,
  status: "COMPLETED",
  classification: "TEST_FAILURE",
  summary: "Flaky assertion in auth.spec.ts",
  postedCommentId: 777n,
  createdAt: SESSION_DATE,
};

/** A second run with every nullable field null, to pin the null mapping. */
const CI_RUN_SPARSE = {
  ...CI_RUN,
  id: "run-2",
  workflowRunId: 1000n,
  pullNumber: null,
  classification: null,
  summary: null,
  postedCommentId: null,
  status: "RUNNING",
};

/** Records what the routes asked the database for. */
let calls: { op: string; args: any }[] = [];

const prismaFake = {
  user: {
    findUnique: async (args: any) => {
      calls.push({ op: "user.findUnique", args });
      return USER;
    },
  },
  reviewSession: {
    findMany: async (args: any) => {
      calls.push({ op: "reviewSession.findMany", args });
      return [SESSION];
    },
    count: async (args: any) => {
      calls.push({ op: "reviewSession.count", args });
      return 1;
    },
    findFirst: async (args: any) => {
      calls.push({ op: "reviewSession.findFirst", args });
      return args?.where?.id === SESSION.id ? SESSION : null;
    },
  },
  cIRun: {
    findMany: async (args: any) => {
      calls.push({ op: "cIRun.findMany", args });
      // The stats endpoint's `recent` query takes 7 and has no pagination.
      return args?.skip !== undefined ? [CI_RUN] : [CI_RUN, CI_RUN_SPARSE];
    },
    count: async (args: any) => {
      calls.push({ op: "cIRun.count", args });
      if (args?.where?.postedCommentId) return 1;
      return 2;
    },
    findFirst: async (args: any) => {
      calls.push({ op: "cIRun.findFirst", args });
      return args?.where?.id === CI_RUN.id ? CI_RUN : null;
    },
    groupBy: async (args: any) => {
      calls.push({ op: "cIRun.groupBy", args });
      if (args.by[0] === "status") {
        return [
          { status: "COMPLETED", _count: { _all: 1 } },
          { status: "RUNNING", _count: { _all: 1 } },
        ];
      }
      return [{ classification: "TEST_FAILURE", _count: { _all: 1 } }];
    },
  },
  installation: {
    findMany: async (args: any) => {
      calls.push({ op: "installation.findMany", args });
      return [
        {
          id: "inst-1",
          githubInstallId: 12345,
          account: "acme",
          createdAt: SESSION_DATE,
          reviews: [SESSION],
        },
      ];
    },
  },
};

mock.module("@repo/database", () => ({ prisma: prismaFake }));
mock.module("jsonwebtoken", () => ({
  default: { verify: () => ({ userId: USER.id, login: USER.login }) },
}));

// Pinned before the import below, because importing ./api reaches middleware/auth
// -> ../env, which validates at module load. Setting these here keeps the suite
// hermetic: it must not depend on what happens to be in the developer's .env.
Object.assign(process.env, {
  GITHUB_WEBHOOK_SECRET: "whsec_test",
  AUTH_JWT_SECRET: "a".repeat(32),
  REDIS_URL: "redis://localhost:6379",
});

const { apiRouter } = await import("./api");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
  server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://localhost:${port}/api`;
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  calls = [];
});

const AUTH = { cookie: "merg_session=fake.jwt.token" };

/**
 * `body` is deliberately `any`: these tests assert the exact JSON the dashboard
 * consumes, and the web app's own `apps/web/src/types/dashboard.ts` is the
 * contract being pinned here.
 */
async function get(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, { headers: AUTH, ...init });
  return { status: response.status, body: await response.json() };
}

describe("auth", () => {
  test("rejects a request with no session cookie", async () => {
    const response = await fetch(`${baseUrl}/reviews`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "NOT_AUTHENTICATED" });
  });
});

describe("GET /me", () => {
  test("returns just the login", async () => {
    expect(await get("/me")).toEqual({
      status: 200,
      body: { success: true, user: { login: "octocat" }, error: null },
    });
  });
});

describe("GET /ci-runs", () => {
  test("returns a page with pagination metadata", async () => {
    const { status, body } = await get("/ci-runs");
    expect(status).toBe(200);
    expect(body.pagination).toEqual({ page: 1, limit: 20, total: 2, pages: 1 });
    expect(body.error).toBeNull();
    expect(body.ciRuns).toHaveLength(1);
    expect(body.ciRuns[0]).toEqual({
      id: "run-1",
      repository: { fullName: "acme/widgets", owner: "acme", name: "widgets" },
      workflowRunId: "999",
      workflowName: "CI",
      headSha: "def456",
      pullNumber: 42,
      status: "COMPLETED",
      classification: "TEST_FAILURE",
      summary: "Flaky assertion in auth.spec.ts",
      postedCommentId: "777",
      createdAt: SESSION_DATE.toISOString(),
    });
  });

  test("serialises bigints as strings and passes nulls through", async () => {
    const { body } = await get("/ci-runs");
    const run = body.ciRuns[0];
    expect(typeof run.workflowRunId).toBe("string");
    expect(run.postedCommentId).toBe("777");
  });

  test("falls back to page 1 for junk input", async () => {
    for (const query of ["page=abc", "page=0", "page=-3", "page="]) {
      const { body } = await get(`/ci-runs?${query}`);
      expect(body.pagination.page).toBe(1);
    }
  });

  test("honours a valid page number", async () => {
    const { body } = await get("/ci-runs?page=3");
    expect(body.pagination.page).toBe(3);
    expect(calls.some((c) => c.op === "cIRun.findMany" && c.args.skip === 40)).toBe(true);
  });
});

describe("GET /ci-runs/stats", () => {
  test("pre-seeds every status and classification with zero", async () => {
    const { status, body } = await get("/ci-runs/stats");
    expect(status).toBe(200);
    expect(body.stats.byStatus).toEqual({
      QUEUED: 0,
      RUNNING: 1,
      COMPLETED: 1,
      FAILED: 0,
    });
    expect(body.stats.byClassification).toEqual({
      BUILD_ERROR: 0,
      TEST_FAILURE: 1,
      LINT: 0,
      TIMEOUT: 0,
      FLAKY: 0,
      UNKNOWN: 0,
    });
    expect(body.stats.total).toBe(2);
    expect(body.stats.postedComments).toBe(1);
  });

  test("is not shadowed by /ci-runs/:id", async () => {
    // If route order regresses, this returns a 404 for a run literally
    // named "stats" instead of the stats payload.
    const { status, body } = await get("/ci-runs/stats");
    expect(status).toBe(200);
    expect(body.ciRun).toBeUndefined();
    expect(body.stats).toBeDefined();
  });

  test("includes recent runs", async () => {
    const { body } = await get("/ci-runs/stats");
    expect(body.stats.recent).toHaveLength(2);
    expect(body.stats.recent[1].pullNumber).toBeNull();
    expect(body.stats.recent[1].classification).toBeNull();
    expect(body.stats.recent[1].postedCommentId).toBeNull();
  });
});

describe("GET /ci-runs/:id", () => {
  test("returns the run", async () => {
    const { status, body } = await get("/ci-runs/run-1");
    expect(status).toBe(200);
    expect(body.ciRun.id).toBe("run-1");
    expect(body.error).toBeNull();
  });

  test("404s with the exact envelope when it is not found", async () => {
    const { status, body } = await get("/ci-runs/nope");
    expect(status).toBe(404);
    expect(body).toEqual({ success: false, error: "CI_RUN_NOT_FOUND", ciRun: null });
  });

  test("scopes the lookup to the caller's installations", async () => {
    await get("/ci-runs/run-1");
    const call = calls.find((c) => c.op === "cIRun.findFirst")!;
    expect(call.args.where).toEqual({
      id: "run-1",
      installationId: { in: ["inst-1"] },
    });
  });
});

describe("GET /dashboard", () => {
  test("groups sessions into repositories per installation", async () => {
    const { status, body } = await get("/dashboard");
    expect(status).toBe(200);
    expect(body.installations).toEqual([
      {
        id: "inst-1",
        githubInstallationId: "12345",
        githubAccountLogin: "acme",
        githubAccountType: "GitHub",
        status: "ACTIVE",
        repositories: [
          {
            id: "acme/widgets",
            owner: "acme",
            name: "widgets",
            fullName: "acme/widgets",
            recentReviews: [
              {
                id: "sess-1",
                prNumber: 42,
                status: "COMPLETED",
                totalComments: 2,
                createdAt: SESSION_DATE.toISOString(),
                completedAt: SESSION_DATE.toISOString(),
              },
            ],
          },
        ],
      },
    ]);
  });
});

describe("GET /reviews", () => {
  test("returns mapped sessions with derived counts", async () => {
    const { status, body } = await get("/reviews");
    expect(status).toBe(200);
    expect(body.pagination).toEqual({ page: 1, limit: 20, total: 1, pages: 1 });
    expect(body.reviews).toEqual([
      {
        id: "sess-1",
        repositoryId: "acme/widgets",
        prNumber: 42,
        headSha: "abc123",
        baseBranch: "main",
        status: "COMPLETED",
        summary: "Looks good to merge!",
        filesReviewed: 1,
        totalComments: 2,
        errorMessage: null,
        startedAt: SESSION_DATE.toISOString(),
        createdAt: SESSION_DATE.toISOString(),
        completedAt: SESSION_DATE.toISOString(),
        repository: {
          id: "acme/widgets",
          fullName: "acme/widgets",
          owner: "acme",
          name: "widgets",
        },
      },
    ]);
  });

  test("leaves completedAt null for a non-terminal session", async () => {
    const original = SESSION.status;
    SESSION.status = "RUNNING";
    try {
      const { body } = await get("/reviews");
      expect(body.reviews[0].completedAt).toBeNull();
    } finally {
      SESSION.status = original;
    }
  });

  test("falls back to page 1 for junk input", async () => {
    const { body } = await get("/reviews?page=nope");
    expect(body.pagination.page).toBe(1);
  });
});

describe("GET /reviews/:id", () => {
  test("returns the session with its comments", async () => {
    const { status, body } = await get("/reviews/sess-1");
    expect(status).toBe(200);
    expect(body.review.id).toBe("sess-1");
    expect(body.review.comments).toEqual([
      {
        id: "c1",
        reviewSessionId: "sess-1",
        filePath: "src/a.ts",
        line: 10,
        title: "Unsanitised input",
        body: "User input reaches exec() unescaped.",
        severity: "HIGH",
        category: "SECURITY",
        suggestion: "Use execFile.",
        githubCommentId: "555",
        createdAt: COMMENT_DATE.toISOString(),
      },
      {
        id: "c2",
        reviewSessionId: "sess-1",
        filePath: "src/a.ts",
        line: 20,
        title: null,
        body: "Something is off.",
        // Unrecognised values fall back rather than leaking through.
        severity: "MEDIUM",
        category: "OTHER",
        suggestion: null,
        githubCommentId: null,
        createdAt: COMMENT_DATE.toISOString(),
      },
    ]);
  });

  test("404s with the exact envelope when it is not found", async () => {
    const { status, body } = await get("/reviews/nope");
    expect(status).toBe(404);
    expect(body).toEqual({ success: false, error: "REVIEW_NOT_FOUND", review: null });
  });

  test("uses findFirst so ownership is enforced in the same query", async () => {
    await get("/reviews/sess-1");
    const call = calls.find((c) => c.op === "reviewSession.findFirst")!;
    expect(call.args.where).toEqual({
      id: "sess-1",
      installationId: { in: ["inst-1"] },
    });
  });
});
