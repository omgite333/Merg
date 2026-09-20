import { ChatGroq } from "@langchain/groq";
import "dotenv/config";
import type { Finding } from "../llm";

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "openai/gpt-oss-120b", // check console.groq.com/docs/models for current recommendation
  temperature: 0,
});

export async function runAgent(
  systemPrompt: string,
  filename: string,
  patch: string,
  fileContent: string | null,
  category: Finding["category"]
): Promise<Finding[]> {
  const userContent = fileContent
    ? `Full file (for context — do not flag issues outside the diff below):\n${fileContent}\n\nDiff:\n${patch}`
    : `Diff:\n${patch}`;

  const response = await model.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: `File: ${filename}\n\n${userContent}` },
  ]);

  try {
    const parsed = JSON.parse(response.content as string);
    return parsed.map((f: any) => ({ ...f, file: filename, category }));
  } catch {
    console.error(`${category} agent failed to parse output:`, response.content);
    return [];
  }
}