import { Router } from "express";
import * as controller from "../controllers/reviews.controller";
import { validate } from "../middleware/validate";
import { idParam, paginationQuery } from "../schema/common.schema";

export const reviewsRouter: Router = Router();

reviewsRouter.get("/", validate(paginationQuery), controller.list);
reviewsRouter.get("/:id", validate(idParam), controller.detail);
