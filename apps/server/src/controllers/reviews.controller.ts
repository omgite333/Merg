import type { Request, Response } from "express";
import { prisma } from "@repo/database";
import { requireUser } from "../middleware/auth";
import { validated } from "../middleware/validate";
import { buildPagination, PAGE_LIMIT } from "../types/api";
import { mapReviewComment, mapReviewSession } from "../mappers/review.mapper";
import type { ReviewSessionRow } from "../types/review";
import type { ReviewsResponse, ReviewDetailResponse } from "../types/responses";

export async function list(req: Request, res: Response) {
  const { page } = validated<{ page: number }>(req);
  const where = { installationId: { in: requireUser(req).installationIds } };

  const [sessions, total] = await Promise.all([
    prisma.reviewSession.findMany({
      where,
      include: { comments: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_LIMIT,
      take: PAGE_LIMIT,
    }),
    prisma.reviewSession.count({ where }),
  ]);

  const body: ReviewsResponse = {
    success: true,
    reviews: sessions.map(mapReviewSession),
    pagination: buildPagination(page, total),
    error: null,
  };
  res.json(body);
}

export async function detail(req: Request, res: Response) {
  const { id } = validated<{ id: string }>(req);

  // findFirst, not findUnique, for the same reason as the CI run detail: a
  // review owned by another installation must look exactly like a missing one.
  const session = await prisma.reviewSession.findFirst({
    where: { id, installationId: { in: requireUser(req).installationIds } },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });

  if (!session) {
    return res.status(404).json({ success: false, error: "REVIEW_NOT_FOUND", review: null });
  }

  const row = session as ReviewSessionRow;
  const body: ReviewDetailResponse = {
    success: true,
    review: {
      ...mapReviewSession(row),
      comments: row.comments.map((comment) => mapReviewComment(comment, row.id)),
    },
    error: null,
  };
  res.json(body);
}
