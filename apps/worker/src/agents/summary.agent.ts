import { ChatGroq } from "@langchain/groq";
import "dotenv/config";
import type { Finding } from "../llm";

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "openai/gpt-oss-120b",
  temperature: 0.2,
  maxTokens: 1024,
});

export const SUMMARY_SYSTEM = `You are a senior engineering lead writing the top-level summary for a pull request review. Three specialist agents (code correctness, security, performance) have already reviewed this PR and produced findings, which will be posted as separate inline comments. Your job is to summarize the PR itself and synthesize the findings — not to re-review the code.

## Your single most important constraint: synthesize, do not invent
You are given the PR title, the list of changed files, and the exact findings the three agents produced. Do not introduce new issues, do not describe code you have not been shown, and do not invent changes that aren't reflected in the file list.

## What you produce
Return ONLY a JSON object (no markdown fences, no prose outside it) with exactly these fields:
- "title": string — a concise conventional-commit-style description of what this PR does, e.g. "improve PR review output and LLM fallback". Do not include a type prefix like "feat:" — that's added separately. Base this on the PR title given to you and the changed files; if the PR title already fully describes it, you can lightly clean it up rather than rewrite it.
- "description": string — ONE sentence (max ~30 words) describing what the PR does at a high level, based on the PR title and changed files.
- "changes": string[] — 3 to 6 bullet points describing the concrete changes, each starting with a present-tense verb ("Introduces", "Updates", "Removes", "Modifies", "Fixes"). Derive these from the changed file paths and the findings' context — do not list every file, group related changes into one bullet. Keep each bullet under 20 words. Reference specific file/directory names in backticks where relevant, e.g. "Removes the \`apps/cli\` directory."

## Internal reasoning — think through this before producing output, but do not include it in your response
1. What is this PR actually doing, based on the file list and PR title?
2. What are the 3-6 most meaningful groupings of change (not a file-by-file list)?
3. Is there anything the findings reveal about intent (e.g. many files touching auth = "auth refactor") that should shape the description?

Return ONLY the raw JSON object. No scratchpad, no markdown fences, no text outside the object.`;

export interface SummaryResult {
  title: string;
  description: string;
  changes: string[];
}

async function generateSummary(
  findings: Finding[],
  meta: { prTitle: string; owner: string; repo: string; pullNumber: number; changedFiles: string[] }
): Promise<SummaryResult> {
  const findingsList = findings.length
    ? findings
        .map((f) => `- [${f.severity.toUpperCase()}${f.blocking ? " · BLOCKING" : ""}] ${f.category} — ${f.file}:${f.line} — ${f.message}`)
        .join("\n")
    : "No findings were reported by the code, security, or performance agents.";

  const response = await model.invoke([
    { role: "system", content: SUMMARY_SYSTEM },
    {
      role: "user",
      content: `Repository: ${meta.owner}/${meta.repo}
Pull request: #${meta.pullNumber}
PR title: ${meta.prTitle}
Changed files:
${meta.changedFiles.map((f) => `- ${f}`).join("\n")}

Findings:
${findingsList}`,
    },
  ]);

  let text = (response.content as string).trim();
  text = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();

  try {
    const parsed = JSON.parse(text);
    return {
      title: parsed.title ?? meta.prTitle,
      description: parsed.description ?? "",
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
    };
  } catch (err) {
    console.error("Summary agent failed to parse output:", err, text);
    return { title: meta.prTitle, description: "", changes: [] };
  }
}

/**
 * Builds the exact review-body markdown GitHub renders. The verdict badge
 * and stat lines are computed here from real numbers, not by the LLM —
 * only the title/description/change bullets come from the model.
 */
export async function buildReviewSummary(
  findings: Finding[],
  meta: {
    prTitle: string;
    owner: string;
    repo: string;
    pullNumber: number;
    changedFiles: string[];
    durationSeconds: number;
  }
): Promise<{ body: string; hasBlocking: boolean }> {
  const { title, description, changes } = await generateSummary(findings, meta);

  const blockingCount = findings.filter((f) => f.blocking).length;
  const hasBlocking = blockingCount > 0;

  let verdictLine: string;
  if (hasBlocking) {
    verdictLine = `🛑 **Changes requested**`;
  } else if (findings.length > 0) {
    verdictLine = `⚠️ **Minor issues found**`;
  } else {
    verdictLine = `✅ **Looks good to merge!**`;
  }

  const issuesLine =
    findings.length === 0
      ? `No actionable issues found in ${meta.changedFiles.length} changed files.`
      : `${findings.length} actionable ${findings.length === 1 ? "issue" : "issues"} found in ${meta.changedFiles.length} changed files.`;

  const blockingLine =
    blockingCount === 0
      ? `No blocking issues detected.`
      : `${blockingCount} blocking ${blockingCount === 1 ? "issue" : "issues"} detected.`;

  const changeBullets = changes.length
    ? changes.map((c) => `- ${c}`).join("\n")
    : "- No notable changes summarized.";

  const body = `### PR Reviewer Summary - ${title}

${description}

${changeBullets}

${verdictLine}

${issuesLine}
${blockingLine}

---
_Reviewed ${meta.changedFiles.length} files in ${meta.durationSeconds.toFixed(1)}s_`;

  return { body, hasBlocking };
}