export interface Finding {
  file: string;
  line: number;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: "bug" | "security" | "performance" | "style";
  message: string;
}