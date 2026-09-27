import type { ASTCall, ParsedFile, SymbolKind, ASTSymbol } from "./ast";
import type { ResolvedImport } from "./imports";
import type { ContextEngineLimits } from "./limits";

export type GraphNodeType = "file" | "function" | "method" | "class";

export type GraphNode = {
  id: string;
  type: GraphNodeType;
  name: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
};

export type GraphEdgeType =
  | "FILE_IMPORTS_FILE"
  | "FILE_CONTAINS_SYMBOL"
  | "CLASS_CONTAINS_METHOD"
  | "FUNCTION_CALLS_FUNCTION"
  | "FILE_EXPORTS_SYMBOL";

export type GraphEdge = {
  source: string;
  target: string;
  type: GraphEdgeType;
};

export type CodeGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

function fileNodeId(filePath: string): string {
  return `file:${filePath}`;
}

function symbolNodeId(kind: SymbolKind, filePath: string, name: string): string {
  return `symbol:${kind}:${filePath}:${name}`;
}

type Entity = GraphNode & { kind: "file" | "symbol" };

class GraphBuilder {
  readonly nodes: GraphNode[] = [];
  readonly edges: GraphEdge[] = [];
  private readonly nodeIds = new Set<string>();
  private readonly edgeKeys = new Set<string>();

  constructor(private readonly limits: ContextEngineLimits) {}

  has(nodeId: string): boolean {
    return this.nodeIds.has(nodeId);
  }

  addNode(node: GraphNode): boolean {
    if (this.nodeIds.has(node.id) || this.nodeIds.size >= this.limits.maxNodes) return false;
    this.nodeIds.add(node.id);
    this.nodes.push(node);
    return true;
  }

  addEdge(source: string, target: string, type: GraphEdgeType): boolean {
    if (!this.nodeIds.has(source) || !this.nodeIds.has(target)) return false;
    if (this.edges.length >= this.limits.maxEdges) return false;
    const key = `${type}:${source}->${target}`;
    if (this.edgeKeys.has(key)) return false;
    this.edgeKeys.add(key);
    this.edges.push({ source, target, type });
    return true;
  }

  /** Returns the live node for an id (bounded) or creates a bare one when missing. */
  fileNode(filePath: string): Entity {
    const id = fileNodeId(filePath);
    this.addNode({ id, type: "file", name: filePath, filePath });
    return { id, type: "file", name: filePath, filePath, kind: "file" };
  }
}

function nodeForSymbol(symbol: ASTSymbol): GraphNode {
  return {
    id: symbolNodeId(symbol.kind, symbol.filePath, symbol.name),
    type: symbol.kind as GraphNodeType,
    name: symbol.name,
    filePath: symbol.filePath,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
  };
}

/**
 * Phase 1C: an in-memory code graph built only from what the review actually
 * touches — changed files plus resolved local dependencies. Relationships are
 * captured without any external service (no Neo4j, no vector store).
 */
export function buildCodeGraph(input: {
  parsedFiles: ParsedFile[];
  resolvedImports: ResolvedImport[];
  limits: ContextEngineLimits;
}): CodeGraph {
  const { parsedFiles, resolvedImports, limits } = input;
  const builder = new GraphBuilder(limits);

  // Deterministic: process files and their symbols in sorted path order.
  const ordered = [...parsedFiles].sort((a, b) => (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0));

  // Map: class id → set of method ids living inside it.
  const methodNodes = new Map<string, GraphNode>();
  const classNodes = new Map<string, GraphNode>();

  for (const parsed of ordered) {
    builder.fileNode(parsed.filePath);

    for (const symbol of parsed.symbols) {
      const node = nodeForSymbol(symbol);
      if (!builder.addNode(node)) break;
      builder.addEdge(builder.fileNode(parsed.filePath).id, node.id, "FILE_CONTAINS_SYMBOL");
      if (symbol.exported) {
        builder.addEdge(builder.fileNode(parsed.filePath).id, node.id, "FILE_EXPORTS_SYMBOL");
      }
      if (symbol.kind === "method") methodNodes.set(node.id, node);
      if (symbol.kind === "class") classNodes.set(node.id, node);
    }
  }

  // Class containment: methods whose range falls inside the class range.
  for (const classNode of classNodes.values()) {
    for (const methodNode of methodNodes.values()) {
      if (methodNode.filePath !== classNode.filePath) continue;
      const within =
        methodNode.startLine! >= classNode.startLine! && methodNode.endLine! <= classNode.endLine!;
      if (within) {
        builder.addEdge(classNode.id, methodNode.id, "CLASS_CONTAINS_METHOD");
      }
    }
  }

  // Import dependencies between local files.
  for (const imp of resolvedImports) {
    if (!imp.resolvedPath) continue;
    builder.addEdge(
      builder.fileNode(imp.filePath).id,
      builder.fileNode(imp.resolvedPath).id,
      "FILE_IMPORTS_FILE"
    );
  }

  // Call sites → FUNCTION_CALLS_FUNCTION edges, resolved only against symbols
  // actually in the graph so unknown/external targets are dropped.
  const byName = new Map<string, string[]>();
  for (const parsed of ordered) {
    for (const symbol of parsed.symbols) {
      const id = symbolNodeId(symbol.kind, symbol.filePath, symbol.name);
      if (!builder.has(id)) continue;
      const list = byName.get(symbol.name) ?? [];
      list.push(id);
      byName.set(symbol.name, list);
    }
  }

  // map className#methodName -> method ids, for `Class.method` callers/callees.
  const methodByClassAndName = new Map<string, string[]>();
  for (const classNode of classNodes.values()) {
    for (const methodNode of methodNodes.values()) {
      if (methodNode.filePath !== classNode.filePath) continue;
      const within =
        methodNode.startLine! >= classNode.startLine! && methodNode.endLine! <= classNode.endLine!;
      if (within) {
        const key = `${classNode.name}#${methodNode.name}`;
        const list = methodByClassAndName.get(key) ?? [];
        list.push(methodNode.id);
        methodByClassAndName.set(key, list);
      }
    }
  }

  const lookupSymbol = (name: string, filePath: string | null): string | null => {
    const dot = name.lastIndexOf(".");
    if (dot > 0) {
      const prefix = name.slice(0, dot);
      const member = name.slice(dot + 1);
      // Class.method form.
      const methodMatches = methodByClassAndName.get(`${prefix}#${member}`);
      if (methodMatches?.length) return methodMatches[0] ?? null;
      // Fall back to any symbol whose name matches the member.
      const candidates = byName.get(member);
      if (candidates?.length) return candidates[0] ?? null;
      return null;
    }
    const candidates = byName.get(name);
    if (!candidates?.length) return null;
    if (candidates.length === 1) return candidates[0] ?? null;
    // Ambiguous: prefer the one in the caller's own file if we have it.
    if (filePath) {
      const sameFile = candidates.find((id) => id.includes(`:${filePath}:`));
      if (sameFile) return sameFile;
    }
    return candidates[0] ?? null;
  };

  for (const parsed of ordered) {
    let calls: ASTCall[];
    if (parsed.calls.length > 1000) calls = parsed.calls.slice(0, 1000);
    else calls = parsed.calls;

    for (const call of calls) {
      const callerId = call.caller ? lookupSymbol(call.caller, parsed.filePath) : null;
      const calleeId = lookupSymbol(call.callee, parsed.filePath);
      if (callerId && calleeId && callerId !== calleeId) {
        builder.addEdge(callerId, calleeId, "FUNCTION_CALLS_FUNCTION");
      }
    }
  }

  return { nodes: builder.nodes, edges: builder.edges };
}