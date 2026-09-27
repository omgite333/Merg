/**
 * The `{ success, ...payload, error }` envelope every dashboard endpoint
 * returns. The web client narrows on `success` and reads `error` to raise, so
 * the shape is part of the public contract — see apps/web/src/lib/api.ts.
 */

export type ApiErrorCode =
  | "NOT_AUTHENTICATED"
  | "INVALID_SESSION"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "REVIEW_NOT_FOUND"
  | "CI_RUN_NOT_FOUND"
  | "INTERNAL_ERROR";

export type ApiSuccess<T extends Record<string, unknown>> = {
  success: true;
  error: null;
} & T;

export type ApiFailure = {
  success: false;
  error: ApiErrorCode;
  [key: string]: unknown;
};

export type ApiResponse<T extends Record<string, unknown>> = ApiSuccess<T> | ApiFailure;
export type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

/** Page size shared by the two list endpoints. */
export const PAGE_LIMIT = 20;

/**
 * Thrown by controllers to produce a 4xx. Carries the extra envelope keys the
 * original inline handlers sent, so `GET /reviews/:id` can still answer
 * `{ success: false, error: "REVIEW_NOT_FOUND", review: null }`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: ApiErrorCode, details: Record<string, unknown> = {}) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function buildPagination(page: number, total: number, limit = PAGE_LIMIT): Pagination {
  return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}
