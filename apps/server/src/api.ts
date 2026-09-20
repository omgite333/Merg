import { Router } from "express";
import { prisma } from "@repo/database";

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
  createdAt: Date;
  comments: {
    id: string;
    file: string;
    line: number;
    severity: string;
    category: string;
    message: string;
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
    title: null,
    body: comment.message,
    severity: SEVERITY[comment.severity] ?? "MEDIUM",
    category: CATEGORY[comment.category] ?? "OTHER",
    suggestion: null,
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
    summary: null,
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

apiRouter.get("/dashboard", async (_req, res) => {
  const installations = await prisma.installation.findMany({
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

  const [sessions, total] = await Promise.all([
    prisma.reviewSession.findMany({
      include: { comments: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * LIMIT,
      take: LIMIT,
    }),
    prisma.reviewSession.count(),
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
  const session: SessionWithComments | null = await prisma.reviewSession.findUnique({
    where: { id: req.params.id },
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