/**
 * Hard budget limits for the PR Context Engine phases (1B–1D). Every phase
 * that grows unboundedly (parsing, graph nodes/edges, relevance traversal,
 * source extraction) stops once a limit is hit. Cheap to override per job.
 */
export type ContextEngineLimits = {
  /** How many import hops away from changed files to resolve dependency files. */
  maxDependencyDepth: number;
  /** How many caller/callee hops away from changed symbols to follow. */
  maxTraversalDepth: number;
  /** Max symbols stored per parsed file. */
  maxSymbolsPerFile: number;
  /** Max nodes in the in-memory code graph. */
  maxNodes: number;
  /** Max edges in the in-memory code graph. */
  maxEdges: number;
  /** Max relevant symbols returned in the final context. */
  maxRelevantSymbols: number;
  /** Max distinct files that contribute relevant symbols. */
  maxRelevantFiles: number;
  /** Max source lines extracted per relevant symbol. */
  maxSourceLinesPerSymbol: number;
  /** Max bytes read per workspace source file during extraction. */
  maxSourceBytesPerFile: number;
  /** Max changed + dependency files parsed per review. */
  maxParseFiles: number;
  /** Max previous PRs surfaced per review (Phase 1F). */
  maxHistoryItems: number;
  /** Max review comments surfaced per previous PR (Phase 1F). */
  maxHistoryComments: number;
  /** Max changed files scanned for relevant history (Phase 1F). */
  maxHistoryFiles: number;
};

export const DEFAULT_CONTEXT_LIMITS: ContextEngineLimits = {
  maxDependencyDepth: 2,
  maxTraversalDepth: 2,
  maxSymbolsPerFile: 500,
  maxNodes: 5000,
  maxEdges: 20000,
  maxRelevantSymbols: 60,
  maxRelevantFiles: 40,
  maxSourceLinesPerSymbol: 250,
  maxSourceBytesPerFile: 2 * 1024 * 1024,
  maxParseFiles: 400,
  maxHistoryItems: 5,
  maxHistoryComments: 5,
  maxHistoryFiles: 10,
};

export function mergeLimits(overrides?: Partial<ContextEngineLimits>): ContextEngineLimits {
  return { ...DEFAULT_CONTEXT_LIMITS, ...overrides };
}