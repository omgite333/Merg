import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { Parser, Language } from "web-tree-sitter";
import { getWasmPath } from "tree-sitter-wasm";

const require = createRequire(import.meta.url);
const CORE_WASM = require.resolve("web-tree-sitter/web-tree-sitter.wasm");

export type SourceLanguage = "typescript" | "tsx" | "javascript" | "python";
export type SymbolKind = "function" | "method" | "class";

export type ASTSymbol = {
  name: string;
  /** In-memory identity shared across phases. */
  id: string;
  kind: SymbolKind;
  filePath: string;
  /** 1-based inclusive first line of the declaration/body. */
  startLine: number;
  /** 1-based inclusive last line of the declaration/body. */
  endLine: number;
  exported: boolean;
};

export type ASTImport = {
  filePath: string;
  /** Module specifier as written (e.g. "./validate", "pkg.util", ".util"). */
  source: string;
  /** Names brought in from the module (imported/exported bindings). */
  importedNames: string[];
};

export type ASTCall = {
  filePath: string;
  /** Name of the enclosing function/method, or null for top-level calls. */
  caller: string | null;
  /** Callee as written (identifier, or dotted path for member calls). */
  callee: string;
  /** 1-based line the call appears on. */
  line: number;
};

export type ParsedFile = {
  filePath: string;
  language: SourceLanguage;
  symbols: ASTSymbol[];
  imports: ASTImport[];
  calls: ASTCall[];
  hasError: boolean;
};

const EXTENSION_TO_LANGUAGE: Record<string, SourceLanguage> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".py": "python",
};

export function detectLanguage(filePath: string): SourceLanguage | null {
  return EXTENSION_TO_LANGUAGE[path.extname(filePath).toLowerCase()] ?? null;
}

export function symbolId(kind: SymbolKind, filePath: string, name: string): string {
  return `symbol:${kind}:${filePath}:${name}`;
}

function stripQuotes(text: string): string {
  const trimmed = text.trim();
  if (
    trimmed.length >= 2 &&
    (trimmed[0] === '"' || trimmed[0] === "'" || trimmed[0] === "`") &&
    trimmed[trimmed.length - 1] === trimmed[0]
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

type TsNode = {
  type: string;
  text: string;
  hasError: boolean;
  startPosition: { row: number };
  endPosition: { row: number };
  namedChildren: TsNode[];
  parent: TsNode | null;
  childForFieldName: (name: string) => TsNode | null;
};

function symbolName(node: TsNode): string | null {
  const nameNode = node.childForFieldName("name");
  return nameNode ? nameNode.text : null;
}

function isExported(node: TsNode): boolean {
  let cur: TsNode | null = node.parent;
  while (cur) {
    if (cur.type === "export_statement") return true;
    cur = cur.parent;
  }
  return false;
}

/** Nearest enclosing named function/method, composed as `Class.method` when inside a class. */
function resolveCaller(node: TsNode): string | null {
  let cur: TsNode | null = node.parent;
  while (cur) {
    if (
      cur.type === "function_declaration" ||
      cur.type === "generator_function_declaration" ||
      cur.type === "method_definition" ||
      cur.type === "function_definition"
    ) {
      const name = symbolName(cur);
      if (!name) {
        cur = cur.parent;
        continue;
      }
      const owner = cur.parent?.parent;
      if (owner && (owner.type === "class_definition" || owner.type === "class_declaration")) {
        const className = symbolName(owner);
        if (className && className !== name) return `${className}.${name}`;
      }
      return name;
    }
    if (cur.type === "class_definition" || cur.type === "class_declaration") {
      const className = symbolName(cur);
      if (className) return className;
    }
    if (cur.type === "arrow_function" || cur.type === "lambda") {
      cur = cur.parent;
      continue;
    }
    if (cur.type === "program" || cur.type === "module") return null;
    cur = cur.parent;
  }
  return null;
}

/** Nested inside another function (not a class) — those are logically local. */
function isNestedInFunction(node: TsNode): boolean {
  let cur: TsNode | null = node.parent;
  while (cur && cur.type !== "program" && cur.type !== "module") {
    if (
      cur.type === "function_declaration" ||
      cur.type === "generator_function_declaration" ||
      cur.type === "method_definition" ||
      cur.type === "function_definition" ||
      cur.type === "arrow_function" ||
      cur.type === "lambda"
    ) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

/** True when the node's only enclosing container is a class (i.e. it's a method). */
function withinClassOnly(node: TsNode): boolean {
  let cur: TsNode | null = node.parent;
  while (cur) {
    if (cur.type === "class_definition" || cur.type === "class_declaration") return true;
    if (cur.type === "program" || cur.type === "module") return false;
    if (
      cur.type === "function_declaration" ||
      cur.type === "generator_function_declaration" ||
      cur.type === "method_definition" ||
      cur.type === "function_definition"
    ) {
      return false;
    }
    cur = cur.parent;
  }
  return false;
}

// ---- TypeScript / JavaScript family ---------------------------------------

function collectNamedImportNames(importNode: TsNode): string[] {
  const names: string[] = [];
  const clause = importNode.namedChildren.find((c) => c.type === "import_clause");
  if (!clause) return names;

  const visit = (node: TsNode) => {
    if (node.type === "import_specifier") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) names.push(nameNode.text);
    } else if (node.type === "namespace_import") {
      const ident = node.namedChildren.find((c) => c.type === "identifier" || c.type === "type_identifier");
      if (ident) names.push(ident.text);
      else names.push(node.text.trim().split(/\s+/).pop() ?? "");
    } else if (node.type === "identifier") {
      names.push(node.text); // default import
    } else if (node.namedChildren.length) {
      for (const child of node.namedChildren) visit(child);
    }
  };

  visit(clause);
  return names;
}

function collectExportFromNames(exportNode: TsNode): string[] {
  const names: string[] = [];
  const visit = (node: TsNode) => {
    if (node.type === "export_specifier") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) names.push(nameNode.text);
    } else if (node.type === "namespace_export") {
      names.push("*");
    } else if (node.namedChildren.length) {
      for (const child of node.namedChildren) visit(child);
    }
  };
  for (const child of exportNode.namedChildren) visit(child);
  return names.length ? names : ["*"];
}

// ---- Python -----------------------------------------------------------------

/**
 * Collects the imported names of a python import statement. Node object
 * identity is unstable across web-tree-sitter accessor calls, so the module
 * declaration is excluded by (type, text) signature and `relative_import`
 * subtrees (which merely express the module path) are skipped entirely.
 */
function collectPythonImportItems(node: TsNode, moduleNode: TsNode | null = null): TsNode[] {
  const excluded = new Set(moduleNode ? [`${moduleNode.type}|${moduleNode.text}`] : []);
  const items: TsNode[] = [];

  const visit = (child: TsNode) => {
    const sig = `${child.type}|${child.text}`;
    if (excluded.has(sig)) return;
    if (child.type === "relative_import") return;
    if (child.type === "dotted_name" || child.type === "aliased_import") {
      items.push(child);
      return;
    }
    for (const grandChild of child.namedChildren) visit(grandChild);
  };

  for (const child of node.namedChildren) visit(child);
  return items;
}

function pythonImportedPathText(node: TsNode): string {
  if (node.type === "aliased_import") {
    return node.childForFieldName("name")?.text ?? node.text;
  }
  return node.text;
}

// ---- Extraction -------------------------------------------------------------

/**
 * Parses `content` at the exact PR head and extracts symbols, static imports,
 * and call sites. Returns null for languages the engine does not support.
 * Never throws: parse failures surface as `hasError/` null instead.
 */
export async function parseSourceFile(
  filePath: string,
  content: string,
  maxSymbolsPerFile = 500
): Promise<ParsedFile | null> {
  const language = detectLanguage(filePath);
  if (!language) return null;

  const root = await treeFor(filePath, language, content);
  if (!root) return null;

  const parsed = extractFromTree(filePath, language, root);
  if (parsed.symbols.length > maxSymbolsPerFile) {
    parsed.symbols = parsed.symbols.slice(0, maxSymbolsPerFile);
  }
  return parsed;
}

// Language caching: loading a wasm grammar is expensive, so a single engine
// holds one Language + Parser per supported language for the process lifetime.
let coreInit: Promise<void> | null = null;
const loadedLanguages = new Map<SourceLanguage, Promise<Language>>();
const parsers = new Map<SourceLanguage, Parser>();

function initCore(): Promise<void> {
  coreInit ??= Parser.init({ locateFile: () => CORE_WASM });
  return coreInit;
}

function languageFor(lang: SourceLanguage): Promise<Language> {
  let pending = loadedLanguages.get(lang);
  if (!pending) {
    pending = (async () => {
      await initCore();
      const wasmPath = getWasmPath(lang);
      const bytes = new Uint8Array(await fs.readFile(wasmPath));
      return Language.load(bytes);
    })().catch((err) => {
      loadedLanguages.delete(lang);
      throw err;
    });
    loadedLanguages.set(lang, pending);
  }
  return pending;
}

async function treeFor(filePath: string, language: SourceLanguage, content: string): Promise<TsNode | null> {
  const cached = parsers.get(language);
  const parser =
    cached ??
    (await (async () => {
      const lang = await languageFor(language);
      const fresh = new Parser();
      fresh.setLanguage(lang);
      parsers.set(language, fresh);
      return fresh;
    })());
  try {
    const tree = parser.parse(content);
    if (!tree) return null;
    return tree.rootNode as unknown as TsNode;
  } catch {
    return null;
  }
}

function extractFromTree(filePath: string, language: SourceLanguage, root: TsNode): ParsedFile {
  const isPython = language === "python";
  const symbols: ASTSymbol[] = [];
  const imports: ASTImport[] = [];
  const calls: ASTCall[] = [];

  const visit = (node: TsNode) => {
    const type = node.type;

    if (isPython ? type === "call" : type === "call_expression") {
      const fnNode = node.childForFieldName("function");
      if (
        fnNode &&
        (fnNode.type === "identifier" || fnNode.type === "member_expression" || fnNode.type === "attribute")
      ) {
        calls.push({
          filePath,
          caller: resolveCaller(node),
          callee: fnNode.text,
          line: node.startPosition.row + 1,
        });
      }
    }

    const isFunctionLike =
      isPython
        ? type === "function_definition"
        : type === "function_declaration" || type === "generator_function_declaration" || type === "method_definition";

    if (isFunctionLike) {
      const name = symbolName(node);
      if (name) {
        const kind: SymbolKind = type === "method_definition" || withinClassOnly(node) ? "method" : "function";
        const inScope = type === "method_definition" || !isNestedInFunction(node);
        if (inScope) {
          symbols.push({
            name,
            id: symbolId(kind, filePath, name),
            kind,
            filePath,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            exported: isExported(node),
          });
        }
      }
    }

    const isClass = isPython ? type === "class_definition" : type === "class_declaration";
    if (isClass) {
      const name = symbolName(node);
      if (name && !isNestedInFunction(node)) {
        symbols.push({
          name,
          id: symbolId("class", filePath, name),
          kind: "class",
          filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported: isExported(node),
        });
      }
    }

    // Static imports (and TS re-exports) — the dependency edges for 1D.
    if (isPython) {
      if (type === "import_statement") {
        for (const item of collectPythonImportItems(node)) {
          const source = pythonImportedPathText(item);
          if (source) imports.push({ filePath, source, importedNames: [source] });
        }
      } else if (type === "import_from_statement") {
        const moduleNode = node.childForFieldName("module_name");
        const rawModule = moduleNode ? moduleNode.text : "";
        const source = rawModule || ".";
        const names = collectPythonImportItems(node, moduleNode).map(pythonImportedPathText);
        imports.push({ filePath, source, importedNames: names });
      }
    } else {
      if (type === "import_statement") {
        const sourceNode = node.childForFieldName("source");
        if (sourceNode) {
          imports.push({
            filePath,
            source: stripQuotes(sourceNode.text),
            importedNames: collectNamedImportNames(node),
          });
        }
      } else if (type === "export_statement") {
        const sourceNode = node.childForFieldName("source");
        if (sourceNode) {
          imports.push({
            filePath,
            source: stripQuotes(sourceNode.text),
            importedNames: collectExportFromNames(node),
          });
        }
      }
    }

    for (const child of node.namedChildren) visit(child);
  };

  visit(root);

  // Python has no `export` keyword: module-level public names are the API.
  if (isPython) {
    for (const symbol of symbols) {
      if (symbol.kind === "class" || symbol.kind === "function") {
        symbol.exported = symbol.exported || !symbol.name.startsWith("_");
      }
    }
  }

  return { filePath, language, symbols, imports, calls, hasError: root.hasError };
}