/**
 * The response bodies this API serves, declared once. These mirror
 * apps/web/src/types/dashboard.ts — the dashboard is the only consumer, so the
 * two must stay in step, and having them here means a mapper change that
 * breaks the contract fails the server's typecheck instead of the browser.
 */

import type { ApiSuccess, Pagination } from "./api";
import type { MappedCIRun, CiStats } from "./ci-run";
import type { MappedInstallation, MappedReviewComment, MappedReviewSession } from "./review";

export type MeResponse = ApiSuccess<{ user: { login: string } }>;

export type DashboardResponse = ApiSuccess<{ installations: MappedInstallation[] }>;

export type ReviewsResponse = ApiSuccess<{
  reviews: MappedReviewSession[];
  pagination: Pagination;
}>;

export type ReviewDetailResponse = ApiSuccess<{
  review: MappedReviewSession & { comments: MappedReviewComment[] };
}>;

export type CIRunsResponse = ApiSuccess<{
  ciRuns: MappedCIRun[];
  pagination: Pagination;
}>;

export type CIRunDetailResponse = ApiSuccess<{ ciRun: MappedCIRun }>;

export type CiStatsResponse = ApiSuccess<{ stats: CiStats }>;
