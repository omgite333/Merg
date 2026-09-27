import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { parse } from "cookie";
import { prisma } from "@repo/database";
import { env } from "../env";
import { ApiError } from "../types/api";

const SESSION_COOKIE = "merg_session";

export type SessionPayload = { userId: string; login: string };

/** What `requireAuth` puts on the request, and what controllers read. */
export type AuthedUser = SessionPayload & { installationIds: string[] };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const cookies = parse(req.headers.cookie ?? "");
  const token = cookies[SESSION_COOKIE];

  if (!token) {
    return res.status(401).json({ success: false, error: "NOT_AUTHENTICATED" });
  }

  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, env.AUTH_JWT_SECRET) as SessionPayload;
  } catch {
    return res.status(401).json({ success: false, error: "INVALID_SESSION" });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { installations: { select: { id: true } } },
  });

  if (!user) {
    return res.status(401).json({ success: false, error: "NOT_AUTHENTICATED" });
  }

  req.user = {
    userId: user.id,
    login: user.login,
    installationIds: user.installations.map((installation) => installation.id),
  };

  next();
}

/**
 * Narrowing accessor for controllers. `requireAuth` runs on the whole router,
 * so this only ever fires if a route is mounted outside that guard — which is
 * exactly the mistake worth failing loudly on rather than reading
 * `req.user!` and getting a confusing 500 further down.
 */
export function requireUser(req: Request): AuthedUser {
  if (!req.user) throw new ApiError(401, "NOT_AUTHENTICATED");
  return req.user;
}