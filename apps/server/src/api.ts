import { Router } from "express";
import { requireAuth } from "./middleware/auth";
import { errorHandler, notFound } from "./middleware/error";
import { apiRouter as resourceRouter } from "./routes";

/**
 * Composition root for the dashboard API. Layers, outermost first:
 *
 *   routes/       path + method + validation schema, nothing else
 *   controllers/  orchestration: read the request, call Prisma, shape the body
 *   mappers/      database row -> wire format
 *   schema/       zod request validation
 *   types/        envelope, row shapes, and the labels the web client expects
 *
 * A request crosses each layer exactly once, in that order, and comes back out
 * as a validated `ApiResponse`.
 */
export const apiRouter: Router = Router();

// Everything below requires a valid session, and every query is scoped to
// req.user.installationIds — the installations GitHub says this user can
// access. Never trust an id from the request body/params without checking
// it against that list first.
apiRouter.use(requireAuth);

apiRouter.use(resourceRouter);

apiRouter.use(notFound);
apiRouter.use(errorHandler);
