/**
 * Row shapes the review endpoints read out of Prisma, kept out of the route
 * and controller layers. `status` is a plain `String` column in the schema, so
 * these mirror the database rather than narrowing it — the mappers are where
 * the narrowing to the values the web client expects happens.
 */

export const REVIEW_TERMINAL_STATUSES = ["COMPLETED", "FAILED"] as const;

export const SEVERITY_LABELS: Record<string, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
};

export const CATEGORY_LABELS: Record<string, string> = {
  bug: "BUG",
  security: "SECURITY",
  performance: "PERFORMANCE",
  style: "STYLE",
};

export const SEVERITY_FALLBACK = "MEDIUM";
export const CATEGORY_FALLBACK = "OTHER";

export type ReviewCommentRow = {
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
};

export type ReviewSessionRow = {
  id: string;
  owner: string;
  repo: string;
  pullNumber: number;
  commitSha: string;
  status: string;
  summary: string | null;
  createdAt: Date;
  comments: ReviewCommentRow[];
};

export type RepositoryRef = {
  id: string;
  fullName: string;
  owner: string;
  name: string;
};

export type MappedReviewSession = {
  id: string;
  repositoryId: string;
  prNumber: number;
  headSha: string;
  baseBranch: string;
  status: string;
  summary: string | null;
  filesReviewed: number;
  totalComments: number;
  errorMessage: null;
  startedAt: string;
  createdAt: string;
  completedAt: string | null;
  repository: RepositoryRef;
};

export type MappedReviewComment = {
  id: string;
  reviewSessionId: string;
  filePath: string;
  line: number;
  title: string | null;
  body: string;
  severity: string;
  category: string;
  suggestion: string | null;
  githubCommentId: string | null;
  createdAt: string;
};

export type MappedDashboardReview = {
  id: string;
  prNumber: number;
  status: string;
  totalComments: number;
  createdAt: string;
  completedAt: string | null;
};

export type MappedDashboardRepository = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  recentReviews: MappedDashboardReview[];
};

export type MappedInstallation = {
  id: string;
  githubInstallationId: string;
  githubAccountLogin: string;
  githubAccountType: string;
  status: string;
  repositories: MappedDashboardRepository[];
};
