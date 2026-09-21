import { StateGraph, END, START } from "@langchain/langgraph";
import { ReviewState } from "./review.state";
import { codeAgent } from "../agents/code.agent";
import { securityAgent } from "../agents/security.agent";
import { performanceAgent } from "../agents/performance.agent";
import type { Finding } from "../llm";

const SEVERITY_ORDER: Finding["severity"][] = ["info", "low", "medium", "high", "critical"];

const graph = new StateGraph(ReviewState)
  .addNode("codeReview", async (state) => ({
    codeFindings: await codeAgent(state.filename, state.patch, state.fileContent),
  }))
  .addNode("securityReview", async (state) => ({
    securityFindings: await securityAgent(state.filename, state.patch, state.fileContent),
  }))
  .addNode("performanceReview", async (state) => ({
    performanceFindings: await performanceAgent(state.filename, state.patch, state.fileContent),
  }))
  .addNode("merge", async (state) => {
    const all = [...state.codeFindings, ...state.securityFindings, ...state.performanceFindings];


    const byLine = new Map<string, Finding[]>();
    for (const f of all) {
      const key = `${f.file}:${f.line}`;
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key)!.push(f);
    }

    const merged = Array.from(byLine.values()).map((group) => {
      if (group.length === 1) return group[0];

      const worst = group.reduce((a, b) =>
        SEVERITY_ORDER.indexOf(b.severity) < SEVERITY_ORDER.indexOf(a.severity) ? b : a 
      );

      return {
        ...worst,
        message: group.map((g) => `[${g.category}] ${g.message}`).join("\n"),
        blocking: group.some((g) => g.blocking),
      };
    });

    return { allFindings: merged };
  })
  .addEdge(START, "codeReview")
  .addEdge(START, "securityReview")
  .addEdge(START, "performanceReview")
  .addEdge("codeReview", "merge")
  .addEdge("securityReview", "merge")
  .addEdge("performanceReview", "merge")
  .addEdge("merge", END);

export const reviewGraph = graph.compile();