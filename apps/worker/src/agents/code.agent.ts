import { runAgent } from "./base";

const PROMPT = `You are a code quality reviewer. Find bugs, logic errors, edge cases, and readability issues in this diff. Reply with ONLY a JSON array, no prose, no markdown fences: [{"line": number, "severity": "critical"|"high"|"medium"|"low"|"info", "message": string}]. "line" must be a line number from the diff's added lines. Return [] if nothing to flag.`;

export const codeAgent = (filename: string, patch: string, fileContent: string | null) =>
  runAgent(PROMPT, filename, patch, fileContent, "bug");