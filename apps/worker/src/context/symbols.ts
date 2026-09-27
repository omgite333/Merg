import type { ASTSymbol, ParsedFile } from "./ast";

/**
 * Phase 1B: which declared symbols were actually touched by the diff. A
 * symbol counts as changed when any of its post-image (head) lines overlap
 * its `[startLine, endLine]` range.
 */
export function changedSymbolsForFile(parsed: ParsedFile, changedLines: number[]): ASTSymbol[] {
  if (!parsed.symbols.length || !changedLines.length) return [];
  return parsed.symbols.filter((symbol) => linesIntersectRange(changedLines, symbol.startLine, symbol.endLine));
}

function linesIntersectRange(lines: number[], start: number, end: number): boolean {
  // Any line in `lines` within [start, end]?
  let lo = 0;
  let hi = lines.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const line = lines[mid];
    if (line === undefined) return false;
    if (line < start) lo = mid + 1;
    else if (line > end) hi = mid - 1;
    else return true;
  }
  return false;
}