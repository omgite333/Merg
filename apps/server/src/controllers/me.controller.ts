import type { Request, Response } from "express";
import { requireUser } from "../middleware/auth";
import type { MeResponse } from "../types/responses";

export function me(req: Request, res: Response) {
  const body: MeResponse = {
    success: true,
    user: { login: requireUser(req).login },
    error: null,
  };
  res.json(body);
}
