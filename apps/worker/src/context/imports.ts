import { promises as fs } from "node:fs";
import path from "node:path";
import type { ParsedFile } from "./ast";

export type ResolvedImport = {
  filePath: string;
  source: string;
  /** Absolute-in-repo path of the resolved local file, or null (external/unresolved). */
  resolvedPath: string | null;
};

const TS_EXTENSIONS = [".ts", ".mts", ".cts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".d.ts"];
const PYTHON_EXTENSIONS = [".py"];

/** Splits "..pkg.sub" → { dots: 2, rest: "pkg.sub" }; "./x/z" → { dots: 1, rest: "x/z" }. */
function splitRelativeModule(source: string): { dots: number; rest: string } {
  const leading = source.match(/^\.+/);
  if (leading) return { dots: leading[0].length, rest: source.slice(leading[0].length) };
  return { dots: 0, rest: source };
}

/**
 * Candidate workspace-relative paths for a resolved local module, in
 * deterministic priority order:
 *   - relative imports navigate up `dots` directories from the importer
 *   - absolute dotted specifiers (pkg.util) are mapped under the repo root
 *   - a bare specifier is tried relative to the importer, then root-mapped
 * The importer's language decides which extensions (and directory-index
 * convention) are tried.
 */
function candidatesFor(source: string, fromFile: string): string[] {
  const fromDir = path.posix.dirname(fromFile);
  const { dots, rest } = splitRelativeModule(source);
  const pathFromDotted = rest.replace(/\./g, "/");
  const importerExt = path.posix.extname(fromFile).toLowerCase();
  const isPython = importerExt === ".py";
  const extensions = isPython ? PYTHON_EXTENSIONS : TS_EXTENSIONS;
  const hasExt = path.posix.extname(pathFromDotted) !== "";

  const bases: string[] = [];
  if (dots > 0) {
    let up = fromDir;
    for (let i = 1; i < dots; i++) up = path.posix.dirname(up);
    bases.push(path.posix.join(up, pathFromDotted));
  } else if (rest.startsWith("/")) {
    bases.push(rest.slice(1));
  } else {
    bases.push(path.posix.join(fromDir, pathFromDotted));
    bases.push(pathFromDotted);
  }

  const candidates: string[] = [];
  for (const base of bases) {
    if (hasExt) {
      candidates.push(base);
      continue;
    }
    for (const candidateExt of extensions) {
      candidates.push(`${base}${candidateExt}`);
    }
    if (isPython) {
      candidates.push(path.posix.join(base, "__init__.py"));
    } else {
      for (const candidateExt of TS_EXTENSIONS) {
        candidates.push(path.posix.join(base, `index${candidateExt}`));
      }
    }
  }

  return [...new Set(candidates)];
}

async function fileExists(workspacePath: string, candidate: string): Promise<boolean> {
  const resolved = path.resolve(workspacePath, candidate);
  if (resolved !== workspacePath && !resolved.startsWith(workspacePath + path.sep)) return false;
  try {
    const stat = await fs.stat(resolved);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Resolves a static import to a local file inside the workspace. External
 * packages (react, express, pkg.util when not present in-repo) resolve to
 * null. Purely local — no node_modules lookup, no network.
 */
export async function resolveImportPath(
  workspacePath: string,
  fromFilePath: string,
  source: string
): Promise<string | null> {
  for (const candidate of candidatesFor(source, fromFilePath)) {
    if (!(await fileExists(workspacePath, candidate))) continue;
    return path.posix.normalize(candidate);
  }
  return null;
}

/** Resolves every static import recorded on the given parsed files. */
export async function resolveImports(
  workspacePath: string,
  parsedFiles: ParsedFile[]
): Promise<ResolvedImport[]> {
  const resolved: ResolvedImport[] = [];
  for (const parsed of parsedFiles) {
    for (const imp of parsed.imports) {
      resolved.push({
        filePath: parsed.filePath,
        source: imp.source,
        resolvedPath: await resolveImportPath(workspacePath, parsed.filePath, imp.source),
      });
    }
  }
  return resolved;
}