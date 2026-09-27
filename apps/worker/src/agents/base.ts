import { invokeWithFallback } from "../llmProvider";
import type { Finding } from "../llm";

/**
 * Prompts are instructed to emit a <scratchpad>...</scratchpad> block
 * followed by ONLY the JSON array. This strips the scratchpad (and any
 * accidental markdown fences) and extracts just the array.
 */
function extractJsonArray(raw: string): any[] {
  let text = raw.trim();

  const scratchpadEnd = text.lastIndexOf("</scratchpad>");
  if (scratchpadEnd !== -1) {
    text = text.slice(scratchpadEnd + "</scratchpad>".length).trim();
  }

  text = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();

  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket === -1 || lastBracket === -1) return [];

  return JSON.parse(text.slice(firstBracket, lastBracket + 1));
}

export async function runAgent(
  systemPrompt: string,
  filename: string,
  patch: string,
  fileContent: string | null,
  categoryFallback: Finding["category"]
): Promise<Finding[]> {
  const userContent = fileContent
    ? `Full file (for context — do not flag issues outside the diff below):\n${fileContent}\n\nDiff:\n${patch}`
    : `Diff:\n${patch}`;

  const response = await invokeWithFallback(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `File: ${filename}\n\n${userContent}` },
    ],
    { temperature: 0, maxTokens: 4096, label: "review-agent" }
  );

  try {
    const items = extractJsonArray(response.content);
    return items.map((item: any) => ({
      file: item.filePath ?? filename,
      line: item.line,
      severity: String(item.severity ?? "info").toLowerCase() as Finding["severity"],
      category: String(item.category ?? categoryFallback).toLowerCase() as Finding["category"],
      title: typeof item.title === "string" ? item.title.trim() : null,
      message: item.body ?? "",
      currentCode: item.currentCode ?? null,
      suggestion: item.suggestion ?? null,
      blocking: Boolean(item.blocking),
    }));
  } catch (err) {
    console.error(`Agent failed to parse output for ${filename}:`, err, response.content);
    return [];
  }
}