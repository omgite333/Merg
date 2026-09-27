import type { Request, Response } from "express";
import { prisma } from "@repo/database";
import { requireUser } from "../middleware/auth";
import { mapInstallation } from "../mappers/dashboard.mapper";
import type { ReviewSessionRow } from "../types/review";
import type { DashboardResponse } from "../types/responses";

export async function index(req: Request, res: Response) {
  const installations = await prisma.installation.findMany({
    where: { id: { in: requireUser(req).installationIds } },
    include: {
      reviews: { include: { comments: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const body: DashboardResponse = {
    success: true,
    installations: installations.map((installation) =>
      mapInstallation({ ...installation, reviews: installation.reviews as ReviewSessionRow[] })
    ),
    error: null,
  };
  res.json(body);
}
