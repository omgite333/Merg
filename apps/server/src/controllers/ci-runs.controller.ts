import type { Request, Response } from "express";
import { prisma } from "@repo/database";
import { requireUser } from "../middleware/auth";
import { validated } from "../middleware/validate";
import { buildPagination, PAGE_LIMIT } from "../types/api";
import { buildStats, mapCIRun } from "../mappers/ci-run.mapper";
import type { CIRunRow } from "../types/ci-run";
import type { CIRunsResponse, CIRunDetailResponse, CiStatsResponse } from "../types/responses";

export async function list(req: Request, res: Response) {
  const { page } = validated<{ page: number }>(req);
  const where = { installationId: { in: requireUser(req).installationIds } };

  const [runs, total] = await Promise.all([
    prisma.cIRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_LIMIT,
      take: PAGE_LIMIT,
    }),
    prisma.cIRun.count({ where }),
  ]);

  const body: CIRunsResponse = {
    success: true,
    ciRuns: runs.map(mapCIRun),
    pagination: buildPagination(page, total),
    error: null,
  };
  res.json(body);
}

export async function stats(req: Request, res: Response) {
  const where = { installationId: { in: requireUser(req).installationIds } };

  const [total, groupedByStatus, groupedByClassification, recent, postedComments] =
    await Promise.all([
      prisma.cIRun.count({ where }),
      prisma.cIRun.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.cIRun.groupBy({ by: ["classification"], where, _count: { _all: true } }),
      prisma.cIRun.findMany({ where, orderBy: { createdAt: "desc" }, take: 7 }),
      prisma.cIRun.count({ where: { ...where, postedCommentId: { not: null } } }),
    ]);

  const body: CiStatsResponse = {
    success: true,
    stats: buildStats({
      total,
      statusCounts: groupedByStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      classificationCounts: groupedByClassification.map((row) => ({
        classification: row.classification,
        count: row._count._all,
      })),
      postedComments,
      recent: recent as CIRunRow[],
    }),
    error: null,
  };
  res.json(body);
}

export async function detail(req: Request, res: Response) {
  const { id } = validated<{ id: string }>(req);

  // findFirst, not findUnique: ownership is enforced in the same query, so a
  // run belonging to another installation is indistinguishable from a missing
  // one — no id enumeration across installations.
  const run = await prisma.cIRun.findFirst({
    where: { id, installationId: { in: requireUser(req).installationIds } },
  });

  if (!run) {
    return res.status(404).json({ success: false, error: "CI_RUN_NOT_FOUND", ciRun: null });
  }

  const body: CIRunDetailResponse = { success: true, ciRun: mapCIRun(run), error: null };
  res.json(body);
}
