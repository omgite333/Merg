import { Router } from "express";
import * as controller from "../controllers/ci-runs.controller";
import { validate } from "../middleware/validate";
import { idParam, paginationQuery } from "../schema/common.schema";

export const ciRunsRouter: Router = Router();

// Declaration order is load-bearing: `/stats` must be registered before `/:id`,
// or Express matches the literal segment as an id and the stats endpoint 404s.
ciRunsRouter.get("/", validate(paginationQuery), controller.list);
ciRunsRouter.get("/stats", controller.stats);
ciRunsRouter.get("/:id", validate(idParam), controller.detail);
