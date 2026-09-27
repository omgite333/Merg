import { CI_CLASSIFICATIONS, CI_STATUSES, type CiStats, type CIRunRow, type MappedCIRun } from "../types/ci-run";

export function mapCIRun(run: CIRunRow): MappedCIRun {
  return {
    id: run.id,
    repository: { fullName: `${run.owner}/${run.repo}`, owner: run.owner, name: run.repo },
    // BigInt columns become strings: JSON has no integer type and these ids
    // routinely exceed Number.MAX_SAFE_INTEGER.
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

/**
 * Every known bucket is seeded with a zero before the grouped counts are
 * applied, so the dashboard can render a fixed bar chart without inventing
 * missing keys client-side.
 */
export function buildStats(input: {
  total: number;
  statusCounts: { status: string; count: number }[];
  classificationCounts: { classification: string | null; count: number }[];
  postedComments: number;
  recent: CIRunRow[];
}): CiStats {
  const byStatus: Record<string, number> = Object.fromEntries(
    CI_STATUSES.map((status) => [status, 0])
  );
  for (const row of input.statusCounts) {
    byStatus[row.status] = row.count;
  }

  const byClassification: Record<string, number> = Object.fromEntries(
    CI_CLASSIFICATIONS.map((classification) => [classification, 0])
  );
  for (const row of input.classificationCounts) {
    if (row.classification) byClassification[row.classification] = row.count;
  }

  return {
    total: input.total,
    byStatus,
    byClassification,
    postedComments: input.postedComments,
    recent: input.recent.map(mapCIRun),
  };
}
