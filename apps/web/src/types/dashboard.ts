export type ReviewStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type CommentSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type CommentCategory = "BUG" | "SECURITY" | "PERFORMANCE" | "STYLE" | "OTHER";

export type RecentReview = {
  id: string;
  prNumber: number;
  status: ReviewStatus;
  totalComments: number;
  createdAt: string;
  completedAt: string | null;
};

export type Repository = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  recentReviews: RecentReview[];
};

export type Installation = {
  id: string;
  githubInstallationId: string;
  githubAccountLogin: string;
  githubAccountType: string;
  status: "ACTIVE" | "SUSPENDED" | "REMOVED";
  repositories: Repository[];
};

export type DashboardResponse = {
  success: boolean;
  installations: Installation[];
  error: string | null;
};

export type ReviewRepository = Pick<Repository, "id" | "fullName" | "owner" | "name">;

export type ReviewSession = {
  id: string;
  repositoryId: string;
  prNumber: number;
  headSha: string | null;
  baseBranch: string;
  status: ReviewStatus;
  summary: string | null;
  filesReviewed: number;
  totalComments: number;
  errorMessage: string | null;
  startedAt: string | null;
  createdAt: string;
  completedAt: string | null;
  repository: ReviewRepository;
};

export type ReviewComment = {
  id: string;
  reviewSessionId: string;
  filePath: string;
  line: number;
  title: string | null;
  body: string;
  severity: CommentSeverity;
  category: CommentCategory;
  suggestion: string | null;
  githubCommentId: string | null;
  createdAt: string;
};

export type ReviewDetail = ReviewSession & {
  comments: ReviewComment[];
};

export type ReviewsResponse = {
  success: boolean;
  reviews: ReviewSession[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  error: string | null;
};

export type ReviewDetailResponse = {
  success: boolean;
  review: ReviewDetail;
  error: string | null;
};

export type CIRunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type CiClassification =
  | "BUILD_ERROR"
  | "TEST_FAILURE"
  | "LINT"
  | "TIMEOUT"
  | "FLAKY"
  | "UNKNOWN";

export type CIRun = {
  id: string;
  repository: {
    fullName: string;
    owner: string;
    name: string;
  };
  workflowRunId: string;
  workflowName: string;
  headSha: string;
  pullNumber: number | null;
  status: CIRunStatus;
  classification: CiClassification | null;
  summary: string | null;
  postedCommentId: string | null;
  createdAt: string;
};

export type CIRunsResponse = {
  success: boolean;
  ciRuns: CIRun[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  error: string | null;
};

export type CIRunDetailResponse = {
  success: boolean;
  ciRun: CIRun;
  error: string | null;
};

export type CiStats = {
  total: number;
  byStatus: Record<CIRunStatus, number>;
  byClassification: Record<CiClassification, number>;
  postedComments: number;
  recent: CIRun[];
};

export type CiStatsResponse = {
  success: boolean;
  stats: CiStats;
  error: string | null;
};