import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

export async function runGit(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Builds a fixture repo whose default branch moves *after* the feature
 * branch is created, mirroring how GitHub PR base SHAs evolve:
 *
 *   B1 (base) ── B2 (base-only file, added after branching)
 *        └──── feature: modify login.ts, add validate.ts,
 *                       delete legacy/user.ts, rename util.ts
 *                       → F1 (headSha)
 *
 * baseSha = B2 (the tip the webhook sees), headSha = F1.
 */
export async function makeFixtureRepo() {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "merg-fixture-"));

  const git = (args: string[]) => runGit(["-C", dir, ...args]);
  await git(["init", "-q", "-b", "main"]);
  await git(["config", "user.email", "merg-test@example.com"]);
  await git(["config", "user.name", "Merg Test"]);
  await git(["config", "commit.gpgsign", "false"]);

  // Base commit B1.
  await fs.mkdir(path.join(dir, "src", "auth"), { recursive: true });
  await fs.mkdir(path.join(dir, "legacy"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "src", "auth", "login.ts"),
    [
      "export function login(user: string) {",
      "  const token = generateToken(user);",
      "  return token;",
      "}",
      "",
      "function generateToken(user: string) {",
      "  return `token-${user}`;",
      "}",
      "",
    ].join("\n")
  );
  await fs.writeFile(
    path.join(dir, "legacy", "user.ts"),
    "export const legacyUser = { id: 1 };\n"
  );
  await fs.writeFile(
    path.join(dir, "util.ts"),
    "export function isEven(n: number) { return n % 2 === 0; }\n"
  );

  await git(["add", "."]);
  await git(["commit", "-qm", "base"]);

  // Feature branch, then the base branch advances afterwards.
  await git(["checkout", "-qb", "feature"]);

  // Base advances with a base-only file.
  await git(["checkout", "-q", "main"]);
  await fs.writeFile(path.join(dir, "base-only.md"), "from the base branch\n");
  await git(["add", "."]);
  await git(["commit", "-qm", "base move"]);
  const baseSha = (await git(["rev-parse", "HEAD"])).trim();

  // Feature changes.
  await git(["checkout", "-q", "feature"]);

  await fs.writeFile(
    path.join(dir, "src", "auth", "login.ts"),
    [
      "import { validateCredentials } from './validate';",
      "",
      "export function login(user: string, password: string) {",
      "  validateCredentials(user, password);",
      "  const token = generateToken(user);",
      "  return token;",
      "}",
      "",
      "function generateToken(user: string) {",
      "  return `token-${user}`;",
      "}",
      "",
    ].join("\n")
  );

  await fs.writeFile(
    path.join(dir, "src", "auth", "validate.ts"),
    "export function validateCredentials(user: string, password: string) {\n  if (!password) throw new Error('password required');\n}\n"
  );

  await fs.rm(path.join(dir, "legacy", "user.ts"));

  await fs.mkdir(path.join(dir, "src", "utils"), { recursive: true });
  await fs.rename(path.join(dir, "util.ts"), path.join(dir, "src", "utils", "helpers.ts"));
  await fs.writeFile(
    path.join(dir, "src", "utils", "helpers.ts"),
    "export function isEven(n: number) { return n % 2 === 0; }\n\nexport function isOdd(n: number) { return n % 2 !== 0; }\n"
  );

  await git(["add", "."]);
  await git(["commit", "-qm", "feature changes"]);
  const headSha = (await git(["rev-parse", "HEAD"])).trim();

  return {
    dir,
    baseSha,
    headSha,
    async cleanup() {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

export async function readWorkspaceFile(dir: string, filePath: string): Promise<string> {
  const bytes = await fs.readFile(path.join(dir, filePath));
  if (bytes.includes(0)) throw new Error(`binary fixture ${filePath}`);
  return bytes.toString("utf8");
}

/**
 * Fixture for Phases 1B–1D: real TypeScript + Python modules exercising
 * directory-index imports, relative imports, class methods, call graphs, and
 * python-style module imports. The PR only modifies `src/app.ts` (function
 * body) and `src/auth/validate.ts` (message), leaving the dependencies
 * unchanged so AST/resolution/relevance tests are deterministic:
 *
 *   src/app.ts             (CHANGED)  imports ./auth, ./utils/helpers
 *   src/auth/index.ts      (dep d1)   imports ./validate; exports login(), class Session
 *   src/auth/validate.ts   (CHANGED)  exports validateCredentials()
 *   src/utils/helpers.ts   (dep d1)   exports isEven()
 *   pkg/util.py            (untouched) def compute()
 *   app.py                 (untouched) from pkg.util import compute; def run()
 */
export async function makeAstFixtureRepo() {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "merg-ast-fixture-"));

  const git = (args: string[]) => runGit(["-C", dir, ...args]);
  await git(["init", "-q", "-b", "main"]);
  await git(["config", "user.email", "merg-test@example.com"]);
  await git(["config", "user.name", "Merg Test"]);
  await git(["config", "commit.gpgsign", "false"]);

  // Base commit.
  await fs.mkdir(path.join(dir, "src", "auth"), { recursive: true });
  await fs.mkdir(path.join(dir, "src", "utils"), { recursive: true });
  await fs.mkdir(path.join(dir, "pkg"), { recursive: true });

  await fs.writeFile(
    path.join(dir, "src", "app.ts"),
    [
      "import { login } from './auth';",
      "import { isEven } from './utils/helpers';",
      "",
      "export function main() {",
      "  const check = isEven(2);",
      "  return login('admin', 'secret', check);",
      "}",
      "",
    ].join("\n")
  );

  await fs.writeFile(
    path.join(dir, "src", "auth", "index.ts"),
    [
      "import { validateCredentials } from './validate';",
      "",
      "export function login(user: string, password: string) {",
      "  validateCredentials(user, password);",
      "  return `session:${user}`;",
      "}",
      "",
      "export class Session {",
      "  token = '';",
      "}",
      "",
    ].join("\n")
  );

  await fs.writeFile(
    path.join(dir, "src", "auth", "validate.ts"),
    [
      "export function validateCredentials(user: string, password: string) {",
      "  if (!password) throw new Error('password required');",
      "}",
      "",
    ].join("\n")
  );

  await fs.writeFile(
    path.join(dir, "src", "utils", "helpers.ts"),
    "export function isEven(n: number) { return n % 2 === 0; }\n"
  );

  await fs.writeFile(path.join(dir, "pkg", "__init__.py"), "");
  await fs.writeFile(
    path.join(dir, "pkg", "util.py"),
    ["def compute(x):", "    return x * 2", ""].join("\n")
  );
  await fs.writeFile(
    path.join(dir, "app.py"),
    ["from pkg.util import compute", "", "def run():", "    return compute(2)", ""].join("\n")
  );

  await git(["add", "."]);
  await git(["commit", "-qm", "base"]);
  const baseSha = (await git(["rev-parse", "HEAD"])).trim();

  // Feature changes.
  await git(["checkout", "-qb", "feature"]);

  await fs.writeFile(
    path.join(dir, "src", "app.ts"),
    [
      "import { login } from './auth';",
      "import { isEven } from './utils/helpers';",
      "",
      "export function main() {",
      "  const check = isEven(2);",
      "  return login('admin', check ? 'secret' : 'fallback');",
      "}",
      "",
    ].join("\n")
  );

  await fs.writeFile(
    path.join(dir, "src", "auth", "validate.ts"),
    [
      "export function validateCredentials(user: string, password: string) {",
      "  if (!password) throw new Error(`password required for ${user}`);",
      "}",
      "",
    ].join("\n")
  );

  await git(["add", "."]);
  await git(["commit", "-qm", "feature changes"]);
  const headSha = (await git(["rev-parse", "HEAD"])).trim();

  return {
    dir,
    baseSha,
    headSha,
    async cleanup() {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}