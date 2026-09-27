import { createRepoWorkspace } from "./workspace";
import { extractChangedFiles, type ChangedFile } from "./diff";
import { filterReviewableFiles } from "./filter";
import { parseSourceFile, type ASTSymbol, type ParsedFile } from "./ast";
import { changedSymbolsForFile } from "./symbols";
import { resolveImportPath, type ResolvedImport } from "./imports";
import { buildCodeGraph, type CodeGraph } from "./graph";
import { collectRelevantContext, type RelevantContext } from "./relevant";
import { readWorkspaceSource } from "./source";
import { mergeLimits, type ContextEngineLimits } from "./limits";
import { collectHistory, type HistoryOctokit, type ReviewHistory } from "./history";

export type { ChangedFile, ChangeStatus } from "./diff";
export type { ASTSymbol, ASTImport, ASTCall, ParsedFile, SymbolKind, SourceLanguage } from "./ast";
export type { CodeGraph, GraphNode, GraphEdge, GraphNodeType, GraphEdgeType } from "./graph";
export type { ResolvedImport } from "./imports";
export type { RelevantContext, RelevantSymbol, Relevance } from "./relevant";
export type { ContextEngineLimits } from "./limits";
export type { ReviewHistory, ReviewHistoryItem, HistoryOctokit } from "./history";

export type RepositoryContext = {
  repository: {
    owner: string;
    repo: string;
    prNumber: number;
    baseSha: string;
    headSha: string;
    /** Temporary clone location. Removed as soon as context is built. */
    workspacePath: string;
  };
  changes: {
    files: ChangedFile[];
    /** Symbols whose declaration overlaps the diff (Phase 1B). */
    symbols: ASTSymbol[];
  };
  /** Parsed ASTs of changed + resolved dependency files (Phase 1B/1D). */
  ast?: {
    changed: ParsedFile[];
    dependencies: ParsedFile[];
  };
  /** In-memory code graph over changed + dependency files (Phase 1C). */
  graph?: CodeGraph;
  /** Resolved static imports of the parsed files (Phase 1D). */
  imports?: ResolvedImport[];
  /** Bounded relevant symbols + extracted source (Phase 1D). */
  source?: RelevantContext;
  /** Limited, relevant PR history for the changed files (Phase 1F). */
  history?: ReviewHistory;
  limits: ContextEngineLimits;
};

type DependencyFile = { filePath: string; depth: number; parsed: ParsedFile };

/**
 * Builds the review context for a checkout, running the full engine (Phases
 * 1A–1D) while the workspace is still on disk. After this returns, the only
 * thing that may still need the checkout is `repository.workspacePath` — the
 * extracted source slices are copied into the context itself.
 */
export async function buildContextInWorkspace(params: {
  workspacePath: string;
  baseSha: string;
  headSha: string;
  limits?: Partial<ContextEngineLimits>;
}): Promise<RepositoryContext> {
  const { workspacePath, baseSha, headSha } = params;
  const limits = mergeLimits(params.limits);

  const files = filterReviewableFiles(await extractChangedFiles(workspacePath, baseSha, headSha));

  const changedParsed: ParsedFile[] = [];
  const symbols: ASTSymbol[] = [];
  const dependencyMap = new Map<string, DependencyFile>();
  const dependencies: ParsedFile[] = [];
  const resolvedImports: ResolvedImport[] = [];
  const contentByPath = new Map(files.map((f) => [f.path, f.content]));
  const parsedByPath = new Map<string, ParsedFile | null>(files.map((f) => [f.path, null]));

  let parseCount = 0;
  const parseFile = async (filePath: string, content: string): Promise<ParsedFile | null> => {
    if (parseCount >= limits.maxParseFiles) return null;
    parseCount += 1;
    return parseSourceFile(filePath, content, limits.maxSymbolsPerFile);
  };

  // ---- Phase 1B: parse changed files, detect changed symbols. -------------
  for (const file of files) {
    if (file.status === "deleted" || !file.content) continue;
    const parsed = await parseFile(file.path, file.content);
    if (!parsed) continue;
    changedParsed.push(parsed);
    parsedByPath.set(file.path, parsed);
    symbols.push(...changedSymbolsForFile(parsed, file.changedLines));
  }

  // ---- Phase 1D (import resolution): BFS over local imports, depth-bounded.
  type ResolveJob = { depth: number; files: ParsedFile[] };

  const jobs: ResolveJob[] = [];
  let head = 0;
  if (limits.maxDependencyDepth >= 1) {
    jobs.push({ depth: 1, files: changedParsed });
  }

  while (head < jobs.length) {
    const job = jobs[head];
    head += 1;
    if (!job) continue;
    const { depth, files } = job;
    if (depth > limits.maxDependencyDepth) continue;

    const nextLevel: ParsedFile[] = [];
    for (const from of files) {
      for (const imp of from.imports) {
        let target: string | null = null;
        try {
          target = await resolveImportPath(workspacePath, from.filePath, imp.source);
        } catch {
          target = null;
        }
        resolvedImports.push({ filePath: from.filePath, source: imp.source, resolvedPath: target });
        if (!target) continue;

        const known = parsedByPath.get(target);
        if (known) continue; // already parsed (changed or earlier dependency)
        if (contentByPath.has(target)) {
          parsedByPath.set(target, null); // changed file, not a dependency
          continue;
        }

        const content = await readWorkspaceSource(workspacePath, target, limits.maxSourceBytesPerFile);
        if (!content) continue;
        const parsed = await parseFile(target, content);
        if (!parsed) {
          parsedByPath.set(target, null);
          continue;
        }

        parsedByPath.set(target, parsed);
        dependencyMap.set(target, { filePath: target, depth, parsed });
        nextLevel.push(parsed);
      }
    }

    if (nextLevel.length) {
      nextLevel.sort((a, b) => (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0));
      jobs.push({ depth: depth + 1, files: nextLevel });
    }
  }

  for (const dep of dependencyMap.values()) dependencies.push(dep.parsed);
  dependencies.sort((a, b) => (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0));

  // ---- Phase 1C: in-memory code graph. ------------------------------------
  const graph = buildCodeGraph({
    parsedFiles: [...changedParsed, ...dependencies],
    resolvedImports,
    limits,
  });

  // ---- Phase 1D (relevance): bounded relevant symbols + source. -----------
  const source = await collectRelevantContext({
    workspacePath,
    changedSymbols: symbols,
    dependencyFiles: [...dependencyMap.values()].map((d) => ({
      filePath: d.filePath,
      depth: d.depth,
      parsedSymbols: d.parsed.symbols.filter((s) => s.exported),
    })),
    graph,
    limits,
  });

  return {
    repository: { owner: "", repo: "", prNumber: 0, baseSha, headSha, workspacePath },
    changes: { files, symbols },
    ast: changedParsed.length || dependencies.length ? { changed: changedParsed, dependencies } : undefined,
    graph,
    imports: resolvedImports,
    source,
    limits,
  };
}

/**
 * Phase 1A wrapper: check out the exact PR head commit, then run the full
 * context engine (Phases 1A–1D). The temporary clone is kept alive only while
 * the in-workspace phases need it and is deleted before returning — the
 * delivered context is self-contained.
 */
export async function buildRepositoryContext(params: {
  owner: string;
  repo: string;
  prNumber: number;
  baseSha: string;
  headSha: string;
  authToken?: string;
  /** Reuses the worker's installation Octokit for Phase 1F history. */
  octokit?: HistoryOctokit;
  limits?: Partial<ContextEngineLimits>;
}): Promise<RepositoryContext> {
  const { owner, repo, prNumber, baseSha, headSha, authToken, octokit, limits } = params;

  const workspace = await createRepoWorkspace({ owner, repo, prNumber, baseSha, headSha, authToken });

  console.log(`[ContextEngine] repository cloned, headSha verified (${owner}/${repo} PR #${prNumber})`);

  try {
    const context = await buildContextInWorkspace({
      workspacePath: workspace.workspacePath,
      baseSha,
      headSha,
      limits,
    });
    context.repository.owner = owner;
    context.repository.repo = repo;
    context.repository.prNumber = prNumber;
    context.repository.workspacePath = workspace.workspacePath;

    // Phase 1F: bounded relevant PR history. Reuses the exact same App
    // authentication as the clone; optional — failures degrade to no history.
    if (octokit) {
      context.history = await collectHistory({
        octokit,
        owner,
        repo,
        prNumber,
        changedFiles: context.changes.files,
        limits: context.limits,
      });
    }

    console.log(
      `[ContextEngine] files changed: ${context.changes.files.length}; ` +
        `changed symbols: ${context.changes.symbols.length}; ` +
        `dependencies: ${context.ast?.dependencies.length ?? 0}; ` +
        `relevant symbols: ${context.source?.symbols.length ?? 0}; ` +
        `history items: ${context.history?.items.length ?? 0}`
    );
    return context;
  } finally {
    await workspace.cleanup();
  }
}