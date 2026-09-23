import { Router } from "express";
import { prisma } from "@repo/database";
import { requireAuth } from "./middleware/auth";

const SEVERITY: Record<string, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
};

const CATEGORY: Record<string, string> = {
  bug: "BUG",
  security: "SECURITY",
  performance: "PERFORMANCE",
  style: "STYLE",
};

type SessionWithComments = {
  id: string;
  owner: string;
  repo: string;
  pullNumber: number;
  commitSha: string;
  status: string;
  summary: string | null;
  createdAt: Date;
  comments: {
    id: string;
    file: string;
    line: number;
    severity: string;
    category: string;
    title: string | null;
    message: string;
    suggestion: string | null;
    githubCommentId: bigint | null;
    createdAt: Date;
  }[];
};

const TERMINAL_STATUSES = ["COMPLETED", "FAILED"];

function fullName(session: { owner: string; repo: string }) {
  return `${session.owner}/${session.repo}`;
}

function mapComment(comment: SessionWithComments["comments"][number], sessionId: string) {
  return {
    id: comment.id,
    reviewSessionId: sessionId,
    filePath: comment.file,
    line: comment.line,
    title: comment.title ?? null,
    body: comment.message,
    severity: SEVERITY[comment.severity] ?? "MEDIUM",
    category: CATEGORY[comment.category] ?? "OTHER",
    suggestion: comment.suggestion ?? null,
    githubCommentId: comment.githubCommentId ? String(comment.githubCommentId) : null,
    createdAt: comment.createdAt.toISOString(),
  };
}

function mapSession(session: SessionWithComments) {
  const filesReviewed = new Set(session.comments.map((comment) => comment.file)).size;
  const completedAt =
    TERMINAL_STATUSES.includes(session.status) ? session.createdAt : null;

  return {
    id: session.id,
    repositoryId: fullName(session),
    prNumber: session.pullNumber,
    headSha: session.commitSha,
    baseBranch: "main",
    status: session.status,
    summary: session.summary ?? null,
    filesReviewed,
    totalComments: session.comments.length,
    errorMessage: null,
    startedAt: session.createdAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
    completedAt: completedAt ? completedAt.toISOString() : null,
    repository: {
      id: fullName(session),
      fullName: fullName(session),
      owner: session.owner,
      name: session.repo,
    },
  };
}

export const apiRouter = Router();

// Everything below requires a valid session, and every query is scoped to
// req.user.installationIds — the installations GitHub says this user can
// access. Never trust an id from the request body/params without checking
// it against that list first.
apiRouter.use(requireAuth);

apiRouter.get("/me", async (req, res) => {
  res.json({ success: true, user: { login: req.user!.login }, error: null });
});

function mapCiRun(run: {
  id: string;
  owner: string;
  repo: string;
  workflowRunId: bigint;
  workflowName: string;
  headSha: string;
  pullNumber: number | null;
  status: string;
  classification: string | null;
  summary: string | null;
  postedCommentId: bigint | null;
  createdAt: Date;
}) {
  return {
    id: run.id,
    repository: { fullName: `${run.owner}/${run.repo}`, owner: run.owner, name: run.repo },
    workflowRunId: String(run.workflowRunId),
    workflowName: run.workflowName,
    headSha: run.headSha,
    pullNumber: run.pullNumber,
    status: run.status,
    classification: run.classification,
    summary: run.summary,
    postedCommentId: run.postedCommentId ? String(run.postedCommentId) : null,
    createdAt: run.createdAt.toISOString(),
  };
}

apiRouter.get("/ci-runs", async (req, res) => {
  const parsedPage = Number.parseInt(String(req.query.page ?? "1"), 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const LIMIT = 20;

  const where = { installationId: { in: req.user!.installationIds } };

  const [runs, total] = await Promise.all([
    prisma.cIRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * LIMIT,
      take: LIMIT,
    }),
    prisma.cIRun.count({ where }),
  ]);

  res.json({
    success: true,
    ciRuns: runs.map(mapCiRun),
    pagination: { page, limit: LIMIT, total, pages: Math.max(1, Math.ceil(total / LIMIT)) },
    error: null,
  });
});

apiRouter.get("/ci-runs/:id", async (req, res) => {
  const run = await prisma.cIRun.findFirst({
    where: { id: req.params.id, installationId: { in: req.user!.installationIds } },
  });

  if (!run) {
    return res.status(404).json({ success: false, error: "CI_RUN_NOT_FOUND", ciRun: null });
  }

  res.json({ success: true, ciRun: mapCiRun(run), error: null });
});

apiRouter.get("/dashboard", async (req, res) => {
  const installations = await prisma.installation.findMany({
    where: { id: { in: req.user!.installationIds } },
    include: {
      reviews: { include: { comments: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const mapped = installations.map((installation) => {
    const repositories = new Map<
      string,
      { id: string; owner: string; name: string; fullName: string; recentReviews: unknown[] }
    >();

    for (const session of installation.reviews) {
      const key = fullName(session);
      if (!repositories.has(key)) {
        repositories.set(key, {
          id: key,
          owner: session.owner,
          name: session.repo,
          fullName: key,
          recentReviews: [],
        });
      }

      repositories.get(key)!.recentReviews.push({
        id: session.id,
        prNumber: session.pullNumber,
        status: session.status,
        totalComments: session.comments.length,
        createdAt: session.createdAt.toISOString(),
        completedAt:
          TERMINAL_STATUSES.includes(session.status) ? session.createdAt.toISOString() : null,
      });
    }

    return {
      id: installation.id,
      githubInstallationId: String(installation.githubInstallId),
      githubAccountLogin: installation.account,
      githubAccountType: "GitHub",
      status: "ACTIVE",
      repositories: Array.from(repositories.values()),
    };
  });

  res.json({ success: true, installations: mapped, error: null });
});

apiRouter.get("/reviews", async (req, res) => {
  const parsedPage = Number.parseInt(String(req.query.page ?? "1"), 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const LIMIT = 20;

  const where = { installationId: { in: req.user!.installationIds } };

  const [sessions, total] = await Promise.all([
    prisma.reviewSession.findMany({
      where,
      include: { comments: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * LIMIT,
      take: LIMIT,
    }),
    prisma.reviewSession.count({ where }),
  ]);

  res.json({
    success: true,
    reviews: sessions.map(mapSession),
    pagination: {
      page,
      limit: LIMIT,
      total,
      pages: Math.max(1, Math.ceil(total / LIMIT)),
    },
    error: null,
  });
});

apiRouter.get("/reviews/:id", async (req, res) => {
  // findFirst (not findUnique) so we can enforce ownership in the same
  // query — a review belonging to someone else's installation should look
  // identical to one that doesn't exist.
  const session: SessionWithComments | null = await prisma.reviewSession.findFirst({
    where: { id: req.params.id, installationId: { in: req.user!.installationIds } },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });

  if (!session) {
    return res.status(404).json({ success: false, error: "REVIEW_NOT_FOUND", review: null });
  }

  res.json({
    success: true,
    review: {
      ...mapSession(session),
      comments: session.comments.map((comment) => mapComment(comment, session.id)),
    },
    error: null,
  });
});