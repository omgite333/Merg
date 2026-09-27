import { Router } from "express";
import * as controller from "../controllers/dashboard.controller";

export const dashboardRouter: Router = Router();

dashboardRouter.get("/", controller.index);
