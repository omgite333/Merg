import { describe, expect, test } from "bun:test";
import { collectHistory, type HistoryOctokit, type ReviewHistoryItem } from "./history";
import { buildContextInWorkspace } from "./index";
import { makeFixtureRepo } from "./fixtures";
import { mergeLimits } from "./limits";

type FakeCall = { route: string; options: Record<string, unknown> };

/**
 * A scriptable stand-in for the worker's installation Octokit. Records every
 * request so tests can assert which routes/params were actually used, and
 * serves canned commits / pulls / comments keyed by path, sha and PR number.
 */
function makeHistoryFake(config: {
  commits?: Record<string, unknown[]>;
  pulls?: Record<string, unknown[]>;
  comments?: Record<number, unknown[]>;
  throwOn?: string[];
}) {
  const calls: FakeCall[] = [];
  const octokit = {
    request: async (route: string, options: Record<string, unknown> = {}) => {
      calls.push({ route, options });
      if (config.throwOn?.some((needle) => route.includes(needle))) {
        throw new Error(`simulated failure for ${route}`);
      }
      let data: unknown[] = [];
      if (route === "GET /repos/{owner}/{repo}/commits") {
        data = config.commits?.[String(options.path)] ?? [];
      } else if (route.endsWith("/pulls")) {
        data = config.pulls?.[String(options.commit_sha)] ?? [];
      } else if (route === "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments") {
        data = config.comments?.[Number(options.pull_number)] ?? [];
      }
      return { data };
    },
  } as unknown as HistoryOctokit & { calls: FakeCall[] };
  octokit.calls = calls;
  return octokit;
}

// ---- small data builders ---------------------------------------------------

function commit(sha: string): unknown {
  return { sha };
}

function pull(number: number, extra: Record<string, unknown> = {}): unknown {
  return {
    number,
    title: `PR ${number}`,
    body: `Body ${number}`,
    user: { login: `author${number}` },
    created_at: "2024-05-06T07:08:09Z",
    html_url: `https://github.com/o/r/pull/${number}`,
    ...extra,
  };
}

function reviewComment(
  prNumber: number,
  path: string,
  extra: Record<string, unknown> = {}
): unknown {
  return {
    path,
    body: `Comment ${prNumber} on ${path}`,
    user: { login: `tester${prNumber}` },
    created_at: "2024-05-06T07:08:09Z",
    html_url: `https://github.com/o/r/pull/${prNumber}#discussion-r1`,
    in_reply_to_id: null,
    ...extra,
  };
}

const baseParams = {
  owner: "o",
  repo: "r",
  prNumber: 999,
  limits: mergeLimits(),
};

// ---- tests -----------------------------------------------------------------

describe("collectHistory (Phase 1F)", () => {
  test("collects relevant previous PRs and review comments for a changed file", async () => {
    const fake = makeHistoryFake({
      commits: { "src/a.ts": [commit("c1")] },
      pulls: { c1: [pull(101)] },
      comments: { 101: [reviewComment(101, "src/a.ts")] },
    });

    const history = await collectHistory({
      octokit: fake,
      changedFiles: [{ path: "src/a.ts" }],
      ...baseParams,
    });

    expect(history.items.filter((i) => i.type === "pull_request")).toHaveLength(1);
    expect(history.items.some((i) => i.type === "pull_request" && i.prNumber === 101));
    expect(history.items.some((i) => i.type === "review_comment" && i.filePath === "src/a.ts")).toBe(true);
    // evidence rendering preserves number, author, date, file, body, source type.
    const prItem = history.items.find((i) => i.type === "pull_request")!;
    expect(prItem).toMatchObject({
      type: "pull_request",
      prNumber: 101,
      author: "author101",
      createdAt: "2024-05-06T07:08:09Z",
      filePath: "src/a.ts",
      url: "https://github.com/o/r/pull/101",
    });
    expect(prItem.body).toContain("PR 101");
  });

  test("filters history to the same changed files only", async () => {
    const fake = makeHistoryFake({
      commits: {
        "src/a.ts": [commit("c1")],
        "src/b.ts": [], // no previous history
      },
      pulls: { c1: [pull(101)] },
      comments: {
        101: [reviewComment(101, "src/a.ts"), reviewComment(101, "src/unrelated.ts")],
      },
    });

    const history = await collectHistory({
      octokit: fake,
      changedFiles: [{ path: "src/a.ts" }, { path: "src/b.ts" }],
      ...baseParams,
    });

    expect(history.items.length).toBeGreaterThan(0);
    expect(history.items.every((i) => i.filePath === "src/a.ts")).toBe(true);
    expect(history.items.some((i) => i.filePath === "src/unrelated.ts")).toBe(false);
    expect(
      history.items.some((i) => i.type === "review_comment" && i.body === "Comment 101 on src/a.ts")
    ).toBe(true);
  });

  test("respects maxHistoryFiles / maxHistoryItems / maxHistoryComments", async () => {
    const fake = makeHistoryFake({
      commits: {
        "src/a.ts": [commit("c1"), commit("c2")],
        "src/b.ts": [commit("b1")],
        "src/c.ts": [commit("c0")],
      },
      pulls: {
        c1: [pull(101)],
        c2: [pull(103)],
        b1: [pull(102)],
      },
      comments: {
        101: [reviewComment(101, "src/a.ts"), reviewComment(101, "src/a.ts", { body: "second" })],
      },
    });

    const history = await collectHistory({
      octokit: fake,
      changedFiles: [{ path: "src/a.ts" }, { path: "src/b.ts" }, { path: "src/c.ts" }],
      owner: "o",
      repo: "r",
      prNumber: 999,
      limits: mergeLimits({ maxHistoryFiles: 1, maxHistoryItems: 1, maxHistoryComments: 1 }),
    });

    // only the first sorted file is scanned
    const scannedPaths = fake.calls
      .filter((call) => call.route === "GET /repos/{owner}/{repo}/commits")
      .map((call) => call.options.path);
    expect(scannedPaths).toEqual(["src/a.ts"]);

    expect(history.items.filter((i) => i.type === "pull_request")).toHaveLength(1);
    expect(history.items.filter((i) => i.type === "review_comment")).toHaveLength(1);
  });

  test("normalizes PR and comment fields onto history items", async () => {
    const fake = makeHistoryFake({
      commits: { "src/a.ts": [commit("c1")] },
      pulls: {
        c1: [
          pull(101, {
            body: "Proper body",
            user: { login: "alice" },
            created_at: "2024-05-06T07:08:09Z",
            html_url: "https://github.com/o/r/pull/101",
          }),
        ],
      },
      comments: {
        101: [
          {
            path: "src/a.ts",
            body: "Review this line",
            user: { login: "bob" },
            created_at: "2024-05-06T07:08:09Z",
            html_url: "https://github.com/o/r/pull/101#discussion-r1",
            in_reply_to_id: null,
          },
        ],
      },
    });

    const history = await collectHistory({
      octokit: fake,
      changedFiles: [{ path: "src/a.ts" }],
      ...baseParams,
    });

    expect(history.items).toEqual<ReviewHistoryItem[]>([
      {
        type: "pull_request",
        prNumber: 101,
        author: "alice",
        createdAt: "2024-05-06T07:08:09Z",
        filePath: "src/a.ts",
        body: "PR 101\n\nProper body",
        url: "https://github.com/o/r/pull/101",
      },
      {
        type: "review_comment",
        prNumber: 101,
        author: "bob",
        createdAt: "2024-05-06T07:08:09Z",
        filePath: "src/a.ts",
        body: "Review this line",
        url: "https://github.com/o/r/pull/101#discussion-r1",
      },
    ]);
  });

  test("returns empty history when no previous PRs touch the files", async () => {
    const fake = makeHistoryFake({ commits: { "src/a.ts": [] } });

    const history = await collectHistory({
      octokit: fake,
      changedFiles: [{ path: "src/a.ts" }],
      ...baseParams,
    });

    expect(history.items).toEqual([]);
  });

  test("skips the PR currently being reviewed", async () => {
    const fake = makeHistoryFake({
      commits: { "src/a.ts": [commit("c1")] },
      pulls: { c1: [pull(999), pull(104)] },
      comments: { 104: [reviewComment(104, "src/a.ts")] },
    });

    const history = await collectHistory({
      octokit: fake,
      changedFiles: [{ path: "src/a.ts" }],
      ...baseParams,
    });

    expect(history.items.some((i) => i.prNumber === 999)).toBe(false);
    expect(history.items.some((i) => i.prNumber === 104)).toBe(true);
  });

  test("degrades gracefully when the GitHub API fails", async () => {
    const failing = {
      request: async () => {
        throw new Error("403 rate limit");
      },
    } as unknown as HistoryOctokit;

    const history = await collectHistory({
      octokit: failing,
      changedFiles: [{ path: "src/a.ts" }],
      ...baseParams,
    });

    expect(history.items).toEqual([]);

    // partial failure: commits + pulls fine, comments fail -> PR kept, no crash.
    const partial = makeHistoryFake({
      commits: { "src/a.ts": [commit("c1")] },
      pulls: { c1: [pull(101)] },
      comments: { 101: [reviewComment(101, "src/a.ts")] },
      throwOn: ["/comments"],
    });

    const partialHistory = await collectHistory({
      octokit: partial,
      changedFiles: [{ path: "src/a.ts" }],
      ...baseParams,
    });

    expect(partialHistory.items).toHaveLength(1);
    expect(partialHistory.items[0]).toMatchObject({ type: "pull_request", prNumber: 101 });
  });

  test("returns empty history for no changed files without any API calls", async () => {
    const fake = makeHistoryFake({});

    const history = await collectHistory({
      octokit: fake,
      changedFiles: [],
      ...baseParams,
    });

    expect(history.items).toEqual([]);
    expect(fake.calls.length).toBe(0);
  });

  test("history is optional context and never blocks context building", async () => {
    const repo = await makeFixtureRepo();
    try {
      const context = await buildContextInWorkspace({
        workspacePath: repo.dir,
        baseSha: repo.baseSha,
        headSha: repo.headSha,
      });
      // No octokit -> no history, and the engine still succeeds with changes.
      expect(context.history).toBeUndefined();
      expect(context.changes.files.length).toBeGreaterThan(0);
      expect(context.limits.maxHistoryItems).toBeGreaterThan(0);
    } finally {
      await repo.cleanup();
    }
  });

  test("reuses the provided octokit for every API call (no second auth)", async () => {
    const fake = makeHistoryFake({
      commits: { "src/a.ts": [commit("c1")] },
      pulls: { c1: [pull(101)] },
      comments: { 101: [reviewComment(101, "src/a.ts")] },
    });

    await collectHistory({
      octokit: fake,
      changedFiles: [{ path: "src/a.ts" }],
      ...baseParams,
    });

    expect(fake.calls.map((call) => call.route)).toEqual([
      "GET /repos/{owner}/{repo}/commits",
      "GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls",
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
    ]);

    // owner/repo/pr flow through; credentials never appear on the wire.
    for (const call of fake.calls) {
      expect(call.options.owner).toBe("o");
      expect(call.options.repo).toBe("r");
      expect(JSON.stringify(call.options).toLowerCase()).not.toContain("authorization");
      expect(JSON.stringify(call.options).toLowerCase()).not.toContain("token");
    }
  });
});