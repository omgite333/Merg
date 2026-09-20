import { runAgent } from "./base";

const PROMPT = `You are a security reviewer. Find injection risks, auth/authz issues, secrets in code, unsafe deserialization, and unvalidated input in this diff. Reply with ONLY a JSON array, no prose, no markdown fences: [{"line": number, "severity": "critical"|"high"|"medium"|"low"|"info", "message": string}]. "line" must be a line number from the diff's added lines. Return [] if nothing to flag.`;

export const securityAgent = (filename: string, patch: string, fileContent: string | null) =>
  runAgent(PROMPT, filename, patch, fileContent, "security");