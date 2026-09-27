import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError } from "../types/api";

/** Terminal 404 for API paths no router claimed. */
export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: "NOT_FOUND" });
};

/**
 * Turns anything thrown in a controller into the standard envelope. Express 5
 * forwards rejected async handlers here, so controllers can throw instead of
 * remembering to `return res.status(...).json(...)` on every path.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) {
    res.status(err.status).json({ success: false, error: err.code, ...err.details });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: "VALIDATION_FAILED",
      fields: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  console.error("Unhandled error in API request:", err);
  res.status(500).json({ success: false, error: "INTERNAL_ERROR" });
};
