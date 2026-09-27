import { z } from "zod";

/**
 * Request validation, kept as a discrete step: routes attach
 * `validate(paginationQuery)` before the controller runs, and the controller
 * reads the parsed result instead of reaching into `req.query`.
 *
 * The schemas coerce rather than reject wherever the old inline handlers were
 * lenient (`?page=abc` used to fall back to page 1, not 400), so adding
 * validation here does not change any response a client can currently get.
 */

export const paginationQuery = z.object({
  page: z.coerce
    .number()
    .int()
    .positive()
    // `.catch` runs after the coercion fails, so junk and out-of-range values
    // both land on page 1 exactly as they did before.
    .catch(1)
    .default(1),
});

/**
 * Row ids are UUIDs in the schema, but a malformed id should keep answering
 * 404 from the ownership-scoped lookup rather than 400 from the validator —
 * that was the behaviour before this layer existed.
 */
export const idParam = z.object({
  id: z.string().min(1).max(64),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;
export type IdParam = z.infer<typeof idParam>;
