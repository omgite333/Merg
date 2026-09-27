import { repositoryRef } from "./review.mapper";
import {
  REVIEW_TERMINAL_STATUSES,
  type MappedDashboardRepository,
  type MappedInstallation,
  type ReviewSessionRow,
} from "../types/review";

type InstallationRow = {
  id: string;
  githubInstallId: number;
  account: string;
  reviews: ReviewSessionRow[];
};

export function mapInstallation(installation: InstallationRow): MappedInstallation {
  // Reviews arrive newest-first, but the dashboard groups them by repository
  // first — a PR's sessions must not be split across duplicate repository rows.
  const repositories = new Map<string, MappedDashboardRepository>();

  for (const session of installation.reviews) {
    const key = `${session.owner}/${session.repo}`;
    let repository = repositories.get(key);

    if (!repository) {
      repository = {
        ...repositoryRef(session),
        recentReviews: [],
      };
      repositories.set(key, repository);
    }

    repository.recentReviews.push({
      id: session.id,
      prNumber: session.pullNumber,
      status: session.status,
      totalComments: session.comments.length,
      createdAt: session.createdAt.toISOString(),
      completedAt: (REVIEW_TERMINAL_STATUSES as readonly string[]).includes(session.status)
        ? session.createdAt.toISOString()
        : null,
    });
  }

  return {
    id: installation.id,
    githubInstallationId: String(installation.githubInstallId),
    githubAccountLogin: installation.account,
    githubAccountType: "GitHub",
    status: "ACTIVE",
    repositories: Array.from(repositories.values()),
  };
}
