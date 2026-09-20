import { Annotation } from "@langchain/langgraph";
import type { Finding } from "../llm";

export const ReviewState = Annotation.Root({
  filename: Annotation<string>(),
  patch: Annotation<string>(),
  fileContent: Annotation<string | null>({ default: () => null, reducer: (_, b) => b }),
  codeFindings: Annotation<Finding[]>({ default: () => [], reducer: (_, b) => b }),
  securityFindings: Annotation<Finding[]>({ default: () => [], reducer: (_, b) => b }),
  performanceFindings: Annotation<Finding[]>({ default: () => [], reducer: (_, b) => b }),
  allFindings: Annotation<Finding[]>({ default: () => [], reducer: (_, b) => b }),
});