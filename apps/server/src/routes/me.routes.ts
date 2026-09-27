import { Router } from "express";
import * as controller from "../controllers/me.controller";

export const meRouter: Router = Router();

meRouter.get("/", controller.me);
