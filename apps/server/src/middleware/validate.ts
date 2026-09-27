import type { Request } from "express";
import type { ZodTypeAny, z } from "zod";
import { ApiError } from "../types/api";

/**
 * Runs a request through a zod schema before the controller sees it. Parsed
 * output is written back onto the request so controllers stay free of
 * `req.query`/`req.params` casting.
 *
 *   router.get("/", validate(paginationQuery), controller.list);
 */
export function validate<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: unknown, next: (err?: unknown) => void) => {
    const result = schema.safeParse({
      ...(req.query ?? {}),
      ...(req.params ?? {}),
    });

    if (!result.success) {
      const fields = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return next(new ApiError(400, "VALIDATION_FAILED", { fields }));
    }

    (req as Request & { validated: z.infer<T> }).validated = result.data;
    next();
  };
}

/** Reads whatever the last `validate` in the chain parsed. */
export function validated<T>(req: Request): T {
  return (req as Request & { validated: T }).validated;
}
