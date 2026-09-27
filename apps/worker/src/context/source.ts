import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

export function isWithinWorkspace(workspacePath: string, filePath: string): boolean {
  const resolved = path.resolve(workspacePath, filePath);
  return resolved === workspacePath || resolved.startsWith(workspacePath + path.sep);
}

export function resolveWorkspacePath(workspacePath: string, filePath: string): string {
  return path.resolve(workspacePath, filePath);
}

/**
 * Safely reads a plain-text file from the checkout. Returns null for paths
 * that escape the workspace, directories, oversized files, or binaries.
 */
export async function readWorkspaceSource(
  workspacePath: string,
  filePath: string,
  maxBytes = DEFAULT_MAX_BYTES
): Promise<string | null> {
  if (!isWithinWorkspace(workspacePath, filePath)) return null;

  try {
    const resolved = resolveWorkspacePath(workspacePath, filePath);
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) return null;
    if (stat.size > maxBytes) return null;

    const buffer = await fs.readFile(resolved);
    if (buffer.includes(0)) return null; // binary
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Extracts the source lines of a symbol (1-based inclusive range) from a full
 * file's text. Returns null when the range is empty or exceeds the budget.
 */
export function sliceSourceLines(
  source: string,
  startLine: number,
  endLine: number,
  maxLines: number
): string | null {
  if (startLine < 1 || endLine < startLine) return null;

  const lines = source.split("\n");
  const start = Math.min(startLine, lines.length);
  const end = Math.min(endLine, lines.length);
  if (start > end) return null;

  const slice = lines.slice(start - 1, end);
  if (slice.length > maxLines) return null;
  return slice.join("\n") + "\n";
}