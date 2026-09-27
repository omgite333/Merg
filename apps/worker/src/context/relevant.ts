import type { ASTSymbol } from "./ast";
import type { CodeGraph } from "./graph";
import type { ContextEngineLimits } from "./limits";
import { readWorkspaceSource, sliceSourceLines } from "./source";

export type Relevance = "changed" | "direct-dependency" | "secondary-dependency" | "caller";

export type RelevantSymbol = {
  name: string;
  kind: "function" | "method" | "class";
  filePath: string;
  startLine: number;
  endLine: number;
  source: string | null;
  relevance: Relevance;
};

export type RelevantContext = {
  symbols: RelevantSymbol[];
  files: string[];
};

const PRIORITY: Record<Relevance, number> = {
  changed: 0,
  caller: 1,
  "direct-dependency": 2,
  "secondary-dependency": 3,
};

type DependencyFile = {
  filePath: string;
  depth: number;
  parsedSymbols: ASTSymbol[];
};

function symbolKey(symbol: Pick<ASTSymbol, "kind" | "filePath" | "name">): string {
  return `symbol:${symbol.kind}:${symbol.filePath}:${symbol.name}`;
}

/**
 * Phase 1D: pick the symbols worth sending to the review agents, in strict
 * priority order (changed → callers → direct dependencies → secondary
 * dependencies), deduplicated, and bounded by the context budget.
 */
export async function collectRelevantContext(params: {
  workspacePath: string;
  changedSymbols: ASTSymbol[];
  dependencyFiles: DependencyFile[];
  graph: CodeGraph;
  limits: ContextEngineLimits;
}): Promise<RelevantContext> {
  const { workspacePath, changedSymbols, dependencyFiles, graph, limits } = params;

  const changedIds = new Set(changedSymbols.map((s) => symbolKey(s)));

  // Ranked candidates: relevance + symbol.
  const candidates: Array<{ relevance: Relevance; symbol: ASTSymbol }> = [];

  for (const symbol of changedSymbols) {
    candidates.push({ relevance: "changed", symbol });
  }

  // Callers of changed symbols — walk FUNCTION_CALLS_FUNCTION edges.
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const callerIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.type !== "FUNCTION_CALLS_FUNCTION") continue;
    if (changedIds.has(edge.target)) {
      callerIds.add(edge.source);
      // Follow one more hop (callers of callers) within the traversal budget.
      if (limits.maxTraversalDepth > 1) {
        for (const inner of graph.edges) {
          if (inner.type === "FUNCTION_CALLS_FUNCTION" && inner.target === edge.source) {
            callerIds.add(inner.source);
          }
        }
      }
    }
  }
  for (const id of callerIds) {
    const node = nodeById.get(id);
    if (!node) continue;
    candidates.push({
      relevance: "caller",
      symbol: {
        name: node.name,
        kind: node.type === "class" ? "class" : node.type === "method" ? "method" : "function",
        filePath: node.filePath,
        startLine: node.startLine ?? 0,
        endLine: node.endLine ?? 0,
        id: node.id,
        exported: false,
      },
    });
  }

  // Dependency files, shallowest depth first.
  const dependencyCandidates: Array<{ relevance: Relevance; symbol: ASTSymbol }> = [];
  for (const dep of dependencyFiles) {
    const relevance: Relevance =
      dep.depth <= 0 || dep.depth === 1 ? "direct-dependency" : "secondary-dependency";
    for (const symbol of dep.parsedSymbols) {
      dependencyCandidates.push({ relevance, symbol });
      if (symbol.kind === "class") {
        // Include methods of exported classes so the reviewer sees them too.
        for (const method of dep.parsedSymbols) {
          if (
            method.kind === "method" &&
            method.filePath === symbol.filePath &&
            method.startLine >= symbol.startLine &&
            method.endLine <= symbol.endLine
          ) {
            dependencyCandidates.push({ relevance, symbol: method });
          }
        }
      }
    }
  }
  dependencyCandidates.sort(
    (a, b) => PRIORITY[a.relevance] - PRIORITY[b.relevance] || (a.symbol.filePath < b.symbol.filePath ? -1 : 1)
  );

  // Dedup: first occurrence wins (highest priority).
  const seen = new Set<string>();
  const priorityOrder: Array<{ relevance: Relevance; symbol: ASTSymbol }> = [];
  for (const candidate of [...candidates, ...dependencyCandidates]) {
    const key = symbolKey(candidate.symbol);
    if (seen.has(key)) continue;
    seen.add(key);
    priorityOrder.push(candidate);
  }

  priorityOrder.sort(
    (a, b) =>
      PRIORITY[a.relevance] - PRIORITY[b.relevance] ||
      (a.symbol.filePath < b.symbol.filePath ? -1 : a.symbol.filePath > b.symbol.filePath ? 1 : 0) ||
      a.symbol.startLine - b.symbol.startLine
  );

  // Apply budgets: cap files and symbols, then extract source slices lazily.
  const symbols: RelevantSymbol[] = [];
  const filesSeen = new Set<string>();
  const contentCache = new Map<string, string>();

  const readContent = (filePath: string): Promise<string | null> => {
    let content = contentCache.get(filePath);
    if (content !== undefined) return Promise.resolve(content ?? null);
    return readWorkspaceSource(workspacePath, filePath, limits.maxSourceBytesPerFile).then((text) => {
      contentCache.set(filePath, text ?? "");
      return text;
    });
  };

  for (const { relevance, symbol } of priorityOrder) {
    if (symbols.length >= limits.maxRelevantSymbols) break;
    if (!filesSeen.has(symbol.filePath)) {
      if (filesSeen.size >= limits.maxRelevantFiles) continue;
      filesSeen.add(symbol.filePath);
    }

    const content = await readContent(symbol.filePath);
    const source =
      content == null
        ? null
        : sliceSourceLines(content, symbol.startLine, symbol.endLine, limits.maxSourceLinesPerSymbol);

    symbols.push({
      name: symbol.name,
      kind: symbol.kind,
      filePath: symbol.filePath,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      source,
      relevance,
    });
  }

  const files = [...filesSeen].sort();
  return { symbols, files };
}