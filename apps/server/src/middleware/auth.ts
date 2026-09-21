import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { parse } from "cookie";
import { prisma } from "@repo/database";

const SESSION_COOKIE = "merg_session";

export type SessionPayload = { userId: string; login: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionPayload & { installationIds: string[] };
    }
  }
}

function getSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) throw new Error("AUTH_JWT_SECRET is not set");
  return secret;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const cookies = parse(req.headers.cookie ?? "");
  const token = cookies[SESSION_COOKIE];

  if (!token) {
    return res.status(401).json({ success: false, error: "NOT_AUTHENTICATED" });
  }

  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, getSecret()) as SessionPayload;
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