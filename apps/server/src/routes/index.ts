import { Router } from "express";
import { meRouter } from "./me.routes";
import { dashboardRouter } from "./dashboard.routes";
import { reviewsRouter } from "./reviews.routes";
import { ciRunsRouter } from "./ci-runs.routes";

/**
 * The resource routers, in the order they should be mounted. Each one owns its
 * paths and its validation; none of them know about auth, which is applied once
 * by the caller in api.ts.
 */
export const apiRouter: Router = Router();

apiRouter.use("/me", meRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/reviews", reviewsRouter);
apiRouter.use("/ci-runs", ciRunsRouter);
