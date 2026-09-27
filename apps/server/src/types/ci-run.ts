/** Row and mapped shapes for the CI triage endpoints. */

export const CI_STATUSES = ["QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const;

export const CI_CLASSIFICATIONS = [
  "BUILD_ERROR",
  "TEST_FAILURE",
  "LINT",
  "TIMEOUT",
  "FLAKY",
  "UNKNOWN",
] as const;

export type CiClassification = (typeof CI_CLASSIFICATIONS)[number];
export type CiStatus = (typeof CI_STATUSES)[number];

export type CIRunRow = {
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
};

export type MappedCIRun = {
  id: string;
  repository: { fullName: string; owner: string; name: string };
  workflowRunId: string;
  workflowName: string;
  headSha: string;
  pullNumber: number | null;
  status: string;
  classification: string | null;
  summary: string | null;
  postedCommentId: string | null;
  createdAt: string;
};

export type CiStats = {
  total: number;
  byStatus: Record<string, number>;
  byClassification: Record<string, number>;
  postedComments: number;
  recent: MappedCIRun[];
};
