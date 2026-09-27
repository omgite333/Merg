import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readWorkspaceSource } from "./source";

const execFileAsync = promisify(execFile);

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

export type ChangedFile = {
  /** Path of the file in the head commit. */
  path: string;
  /** Previous path — set only for renames. */
  previousPath: string | null;
  status: ChangeStatus;
  additions: number;
  deletions: number;
  /** Unified diff hunks for this file (base → head). */
  patch: string;
  /** Full head content of the file, or null when deleted/unreadable/binary. */
  content: string | null;
  /** Post-image (head) line numbers touched by the diff, 1-based, sorted. */
  changedLines: number[];
};

const MAX_CONTENT_BYTES = 2 * 1024 * 1024;

async function git(args: string[], cwd: string, timeoutMs = 60_000): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 256 * 1024 * 1024,
    timeout: timeoutMs,
  });
  return stdout;
}

function parseNameStatus(stdout: string): Array<{ status: string; oldPath: string; newPath: string }> {
  const entries: Array<{ status: string; oldPath: string; newPath: string }> = [];

  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const [code, first, second] = line.split("\t");
    const status = code?.[0] ?? "M";
    if (status === "R") {
      entries.push({ status: "R", oldPath: first ?? "", newPath: second ?? "" });
    } else {
      entries.push({ status, oldPath: first ?? "", newPath: first ?? "" });
    }
  }

  return entries;
}

function countAdditionsAndDeletions(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }

  return { additions, deletions };
}

const MAX_PATCH_BYTES = 512 * 1024;

/**
 * Returns the diff hunks for a single file between two commits, guarded so a
 * path argument can never be interpreted as a flag and so the output can't
 * blow up memory for a huge file.
 */
async function filePatch(
  workspacePath: string,
  mergeBase: string,
  headSha: string,
  filePath: string
): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", workspacePath, "diff", "--find-renames", "--unified=3", mergeBase, headSha, "--", filePath],
    { maxBuffer: MAX_PATCH_BYTES * 2, timeout: 60_000 }
  );
  return stdout;
}

/**
 * Reads a file from the checked-out worktree at head. Returns null for
 * deleted files, binaries, and paths that would escape the workspace.
 */
function readHeadContent(workspacePath: string, filePath: string): Promise<string | null> {
  return readWorkspaceSource(workspacePath, filePath, MAX_CONTENT_BYTES);
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Extracts post-image (head) line numbers touched by a unified diff patch.
 * Added and context lines advance the new-file cursor; removed lines only
 * consume the old side, so the resulting numbers always refer to the head
 * file. Returns an ascending list of 1-based line numbers.
 */
export function parseChangedLines(patch: string): number[] {
  const changedLines: number[] = [];
  let inHunk = false;
  let newLine = 0;

  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
      inHunk = false;
      continue;
    }

    const hunk = line.match(HUNK_HEADER);
    if (hunk) {
      inHunk = true;
      newLine = Number.parseInt(hunk[2] ?? "0", 10);
      continue;
    }

    if (!inHunk) continue;

    const first = line[0];
    if (first === "+" || first === " ") {
      if (newLine > 0) changedLines.push(newLine);
      newLine += 1;
    } else if (first === "-") {
      // Removed lines only exist on the old side.
    } else if (first === "\\") {
      // "\ No newline at end of file" marker — not a source line.
    } else {
      inHunk = false;
    }
  }

  return changedLines;
}

/**
 * Extracts the set of files changed between the PR base and head, using the
 * PR merge-base so base-branch commits made after the PR branched off don't
 * leak into the diff. Returns head content for each non-deleted file.
 */
export async function extractChangedFiles(
  workspacePath: string,
  baseSha: string,
  headSha: string
): Promise<ChangedFile[]> {
  let mergeBase: string;
  try {
    mergeBase = (await git(["merge-base", baseSha, headSha], workspacePath)).trim();
  } catch {
    // Unrelated/shallow history fallback — diff base tip against head tip.
    mergeBase = baseSha;
  }

  const nameStatus = await git(
    ["diff", "--find-renames", "--name-status", mergeBase, headSha],
    workspacePath
  );

  const changedFiles: ChangedFile[] = [];
  for (const entry of parseNameStatus(nameStatus)) {
    const isRename = entry.status === "R";

    let status: ChangeStatus;
    switch (entry.status) {
      case "A":
        status = "added";
        break;
      case "D":
        status = "deleted";
        break;
      case "R":
        status = "renamed";
        break;
      default:
        // M, T (type change) and anything unexpected — safest to treat as modified.
        status = "modified";
    }

    const targetPath = status === "deleted" ? entry.oldPath : entry.newPath;
    const patch = await filePatch(workspacePath, mergeBase, headSha, targetPath);
    const { additions, deletions } = countAdditionsAndDeletions(patch);

    changedFiles.push({
      path: entry.newPath,
      previousPath: isRename ? entry.oldPath : null,
      status,
      additions,
      deletions,
      patch,
      content: status === "deleted" ? null : await readHeadContent(workspacePath, entry.newPath),
      changedLines: parseChangedLines(patch),
    });
  }

  return changedFiles;
}