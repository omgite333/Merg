// Files we never want to run agents on — lockfiles, build output, vendored code.
const SKIP_PATTERNS = [
  /\.lock$/,
  /^dist\//,
  /^build\//,
  /^node_modules\//,
  /\.generated\./,
  /package-lock\.json$/,
  /bun\.lockb?$/,
];

export function filterReviewableFiles<T extends { filename: string }>(files: T[]): T[] {
  return files.filter((f) => !SKIP_PATTERNS.some((p) => p.test(f.filename)));
}

/**
 * Fetches the full current content of a file at a given ref, so agents can
 * see the whole function/file instead of just the bare diff hunk. Returns
 * null for binary files or files too large to decode this way.
 */
export async function getFileContext(
  octokit: any,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path,
      ref,
    });

    if ("content" in data && data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return null;
  } catch (err: any) {
    console.error(`Failed to fetch context for ${path}:`, err.message);
    return null;
  }
}