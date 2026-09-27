import type { ContextEngineLimits } from "./limits";

/**
 * One piece of historical evidence for the files/symbols the current PR
 * touches. Historical information is evidence, not truth: it is never
 * presented as an authoritative instruction, only as prior context.
 *
 * In practice, the reviewer receives a plain-text rendering of these items
 * (PR number, author, date, file, body, source); the structured form keeps
 * the source/type unambiguous and lets downstream phases deduplicate.
 */
export type ReviewHistoryItem = {
  type: "pull_request" | "review_comment";
  prNumber?: number;
  author?: string;
  createdAt?: string;
  filePath?: string;
  body: string;
  url?: string;
};

export type ReviewHistory = {
  items: ReviewHistoryItem[];
};

/**
 * The minimal GitHub API surface Phase 1F needs. The worker already builds a
 * `getInstallationOctokit(installationId)` instance for the git clone;
 * `@octokit/app`'s Octokit satisfies this shape, so history reuses the exact
 * same App authentication rather than creating a second one.
 */
export type HistoryOctokit = {
  request: <T>(route: string, options?: Record<string, unknown>) => Promise<{ data: T }>;
};

type FileCommit = { sha?: string };
type AssociatedPull = {
  number: number;
  title?: string;
  body?: string | null;
  user?: { login?: string } | null;
  created_at?: string;
  html_url?: string;
};
type ReviewComment = {
  path?: string;
  body?: string | null;
  user?: { login?: string } | null;
  created_at?: string;
  html_url?: string;
  in_reply_to_id?: number | null;
};

type PullMeta = {
  number: number;
  title: string;
  body: string | null;
  author: string;
  createdAt: string;
  url: string;
};

const MAX_API_CALLS = 100;

/**
 * Phase 1F: collects a small, bounded set of relevant PR history for the
 * changed files of the current PR. Never throws: any GitHub API failure is
 * logged and the review continues with whatever history was already gathered
 * (possibly none). Priority is same file → same commit → recent → bounded.
 */
export async function collectHistory(params: {
  octokit: HistoryOctokit;
  owner: string;
  repo: string;
  /** The PR currently being reviewed — never treated as its own history. */
  prNumber: number;
  changedFiles: Array<{ path: string }>;
  limits: ContextEngineLimits;
}): Promise<ReviewHistory> {
  const { octokit, owner, repo, prNumber, changedFiles, limits } = params;

  const filePaths = [...new Set(changedFiles.map((f) => f.path))]
    .filter((p) => p)
    .sort()
    .slice(0, Math.max(0, limits.maxHistoryFiles));

  let apiCalls = 0;
  const spends = (n: number): boolean => {
    apiCalls += n;
    return apiCalls > MAX_API_CALLS;
  };

  const items: ReviewHistoryItem[] = [];
  const knownPrs = new Set<number>();

  for (const filePath of filePaths) {
    if (knownPrs.size >= limits.maxHistoryItems || apiCalls >= MAX_API_CALLS) break;

    // Recent commits touching this file (default branch history).
    let commits: FileCommit[] = [];
    try {
      const response = await octokit.request<FileCommit[]>(
        "GET /repos/{owner}/{repo}/commits",
        {
          owner,
          repo,
          path: filePath,
          per_page: Math.max(1, limits.maxHistoryItems),
        }
      );
      commits = response.data ?? [];
      if (spends(1)) break;
    } catch {
      console.warn(`[history] failed to list commits for ${owner}/${repo}@${filePath}`);
      continue;
    }

    // PRs associated with those commits (skip the PR under review).
    const prs: PullMeta[] = [];
    for (const commit of commits) {
      if (!commit.sha) continue;
      if (knownPrs.size >= limits.maxHistoryItems || apiCalls >= MAX_API_CALLS) break;
      try {
        const response = await octokit.request<AssociatedPull[]>(
          "GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls",
          { owner, repo, commit_sha: commit.sha, per_page: 5 }
        );
        if (spends(1)) break;
        for (const pull of response.data ?? []) {
          const number = pull.number;
          if (!number || number === prNumber || knownPrs.has(number)) continue;
          knownPrs.add(number);
          prs.push({
            number,
            title: pull.title ?? "",
            body: pull.body ?? null,
            author: pull.user?.login ?? "",
            createdAt: pull.created_at ?? "",
            url: pull.html_url ?? "",
          });
          if (knownPrs.size >= limits.maxHistoryItems) break;
        }
      } catch {
        console.warn(`[history] failed to list PRs for commit ${commit.sha} (${owner}/${repo})`);
      }
    }

    for (const pull of prs) {
      // The PR itself — context behind its changes.
      const prBody = [pull.title, pull.body].filter((part): part is string => Boolean(part)).join("\n\n");
      items.push({
        type: "pull_request",
        prNumber: pull.number,
        author: pull.author || undefined,
        createdAt: pull.createdAt || undefined,
        filePath,
        body: prBody,
        url: pull.url || undefined,
      });

      // Review comments on that PR for this file.
      const take = Math.max(0, limits.maxHistoryComments - commentsAdded(items));
      if (take <= 0) continue;

      let rawComments: ReviewComment[] = [];
      try {
        const response = await octokit.request<ReviewComment[]>(
          "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
          {
            owner,
            repo,
            pull_number: pull.number,
            path: filePath,
            sort: "created",
            direction: "desc",
            per_page: take,
          }
        );
        rawComments = response.data ?? [];
        if (spends(1)) break;
      } catch {
        console.warn(`[history] failed to list comments on PR #${pull.number} (${owner}/${repo})`);
        continue;
      }

      // Newest first, then stable by position so ordering is deterministic.
      rawComments.sort(
        (a, b) =>
          (b.created_at ?? "").localeCompare(a.created_at ?? "") ||
          ((a.path ?? "").localeCompare(b.path ?? ""))
      );

      for (const comment of rawComments) {
        if (comment.in_reply_to_id) continue; // replies add no new evidence
        if (comment.path !== filePath) continue;
        if (commentsAdded(items) >= limits.maxHistoryComments) break;
        if (!comment.body) continue;
        items.push({
          type: "review_comment",
          prNumber: pull.number,
          author: comment.user?.login ?? undefined,
          createdAt: comment.created_at ?? undefined,
          filePath: comment.path || undefined,
          body: comment.body,
          url: comment.html_url ?? undefined,
        });
      }
    }
  }

  // Deterministic final ordering: file, then recent-first by date.
  items.sort(
    (a, b) =>
      (a.filePath ?? "").localeCompare(b.filePath ?? "") ||
      (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
  );

  return { items };
}

/** Number of review_comment items currently collected. */
function commentsAdded(items: ReviewHistoryItem[]): number {
  let count = 0;
  for (const item of items) {
    if (item.type === "review_comment") count += 1;
  }
  return count;
}