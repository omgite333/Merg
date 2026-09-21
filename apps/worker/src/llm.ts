export interface Finding {
  file: string;
  line: number;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: "bug" | "security" | "performance" | "style" | "refactor" | "documentation" | "test" | "other";
  title?: string | null;
  message: string;
  currentCode?: string | null;
  suggestion?: string | null;
  blocking?: boolean;
}