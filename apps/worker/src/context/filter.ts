// Files we never want to run agents on — lockfiles, build output, vendored code.
const SKIP_PATTERNS = [
  /\.lock$/,
  /^dist\//,
  /^build\//,
  /^node_modules\//,
  /\.generated\./,
  /package-lock\.json$/,
  /bun\.lockb?$/,
];

export function filterReviewableFiles<T extends { filename?: string; path?: string }>(files: T[]): T[] {
  return files.filter((f) => {
    const name = f.filename ?? f.path ?? "";
    return !SKIP_PATTERNS.some((p) => p.test(name));
  });
}