import {
  CATEGORY_FALLBACK,
  CATEGORY_LABELS,
  REVIEW_TERMINAL_STATUSES,
  SEVERITY_FALLBACK,
  SEVERITY_LABELS,
  type MappedReviewComment,
  type MappedReviewSession,
  type RepositoryRef,
  type ReviewCommentRow,
  type ReviewSessionRow,
} from "../types/review";

export function repositoryRef(row: { owner: string; repo: string }): RepositoryRef {
  const fullName = `${row.owner}/${row.repo}`;
  return { id: fullName, fullName, owner: row.owner, name: row.repo };
}

/**
 * A session only has a `completedAt` once it reaches a terminal status. The
 * schema has no separate completion timestamp, so `createdAt` stands in for
 * one — matching what the dashboard has always displayed.
 */
function completedAt(session: ReviewSessionRow): string | null {
  return (REVIEW_TERMINAL_STATUSES as readonly string[]).includes(session.status)
    ? session.createdAt.toISOString()
    : null;
}

export function mapReviewSession(session: ReviewSessionRow): MappedReviewSession {
  return {
    id: session.id,
    repositoryId: `${session.owner}/${session.repo}`,
    prNumber: session.pullNumber,
    headSha: session.commitSha,
    baseBranch: "main",
    status: session.status,
    summary: session.summary ?? null,
    // Distinct files, not comment count — one file can yield several findings.
    filesReviewed: new Set(session.comments.map((comment) => comment.file)).size,
    totalComments: session.comments.length,
    errorMessage: null,
    startedAt: session.createdAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
    completedAt: completedAt(session),
    repository: repositoryRef(session),
  };
}

export function mapReviewComment(
  comment: ReviewCommentRow,
  sessionId: string
): MappedReviewComment {
  return {
    id: comment.id,
    reviewSessionId: sessionId,
    filePath: comment.file,
    line: comment.line,
    title: comment.title ?? null,
    body: comment.message,
    // Agents emit free-text severities; anything unrecognised lands on the
    // middle rung rather than reaching the client as a new value.
    severity: SEVERITY_LABELS[comment.severity] ?? SEVERITY_FALLBACK,
    category: CATEGORY_LABELS[comment.category] ?? CATEGORY_FALLBACK,
    suggestion: comment.suggestion ?? null,
    githubCommentId: comment.githubCommentId ? String(comment.githubCommentId) : null,
    createdAt: comment.createdAt.toISOString(),
  };
}
