import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

export type RepoWorkspace = {
  workspacePath: string;
  baseSha: string;
  headSha: string;
  prNumber: number;
  cleanup: () => Promise<void>;
};

/**
 * Runs a git command in `cwd` using execFile (no shell). `authHeader`, when
 * provided, is passed as `-c http.extraHeader=...` so the GitHub App token
 * never appears in the remote URL.
 */
async function git(
  args: string[],
  cwd: string,
  options: { authHeader?: string; timeoutMs?: number } = {}
): Promise<string> {
  const fullArgs: string[] = [];
  if (options.authHeader) {
    fullArgs.push("-c", `http.extraHeader=${options.authHeader}`);
  }
  fullArgs.push(...args);

  const { stdout } = await execFileAsync("git", fullArgs, {
    cwd,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
    maxBuffer: 256 * 1024 * 1024,
    timeout: options.timeoutMs ?? 60_000,
  });
  return stdout;
}

/**
 * Creates an isolated temporary clone of the repository and checks out
 * exactly `headSha` (detached). Uses a blob:none partial clone so big repos
 * don't download every blob — content is fetched on demand at checkout.
 *
 * Only git operations are ever run here; repository-controlled scripts are
 * never executed. Callers must always `cleanup()` (best-effort) in a
 * `finally` block.
 */
export async function createRepoWorkspace(params: {
  owner: string;
  repo: string;
  prNumber: number;
  baseSha: string;
  headSha: string;
  authToken?: string;
}): Promise<RepoWorkspace> {
  const { owner, repo, prNumber, baseSha, headSha, authToken } = params;

  const workspacePath = await fs.mkdtemp(path.join(tmpdir(), "merg-ctx-"));
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;
  const authHeader = authToken ? `Authorization: Bearer ${authToken}` : undefined;

  try {
    await git(["init", "-q"], workspacePath, { authHeader });
    await git(["remote", "add", "origin", cloneUrl], workspacePath, { authHeader });

    // Fetch base + head by exact SHA. GitHub serves reachable objects on
    // demand, so this works for PR head commits that aren't on any branch
    // we'd otherwise clone. Fall back to the guaranteed refs/pull/N/head
    // ref when a SHA fetch is refused.
    try {
      await git(
        ["fetch", "--filter=blob:none", "--no-tags", "origin", headSha, baseSha],
        workspacePath,
        { authHeader, timeoutMs: 300_000 }
      );
    } catch (fetchError) {
      console.error(
        `SHA fetch failed for ${owner}/${repo} (head=${headSha}, base=${baseSha}), trying PR ref:`,
        (fetchError as Error).message
      );
      await git(
        [
          "fetch",
          "--filter=blob:none",
          "--no-tags",
          "origin",
          `refs/pull/${prNumber}/head:refs/remotes/origin/pr-${prNumber}`,
          `+${baseSha}:refs/remotes/origin/base`,
        ],
        workspacePath,
        { authHeader, timeoutMs: 300_000 }
      );
    }

    await git(["checkout", "--detach", "-q", headSha], workspacePath, {
      authHeader,
      timeoutMs: 300_000,
    });

    // Verify we really are on the PR head.
    const resolvedHead = (await git(["rev-parse", "HEAD"], workspacePath, { authHeader })).trim();
    if (resolvedHead !== headSha) {
      throw new Error(`Checkout mismatch: expected ${headSha}, got ${resolvedHead}`);
    }

    return {
      workspacePath,
      baseSha,
      headSha,
      prNumber,
      async cleanup() {
        await fs.rm(workspacePath, { recursive: true, force: true });
      },
    };
  } catch (err) {
    await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}