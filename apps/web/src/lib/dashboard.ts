import type { CiClassification, CommentSeverity, CIRunStatus, ReviewStatus } from "@/types/dashboard";

export const reviewStatusMeta: Record<ReviewStatus, { label: string; className: string }> = {
  QUEUED: {
    label: "Queued",
    className: "border-[#eadfb9] bg-[#fff8df] text-[#8b6500]",
  },
  RUNNING: {
    label: "Reviewing",
    className: "border-[#cddcff] bg-[#edf3ff] text-[#2860c8]",
  },
  COMPLETED: {
    label: "Completed",
    className: "border-[#c6ead4] bg-[#edf9f1] text-[#167541]",
  },
  FAILED: {
    label: "Needs attention",
    className: "border-[#f3cccc] bg-[#fff0f0] text-[#c23c3c]",
  },
};

export const severityMeta: Record<CommentSeverity, { label: string; className: string }> = {
  CRITICAL: {
    label: "Critical",
    className: "border-[#efc1c1] bg-[#fff0f0] text-[#b42318]",
  },
  HIGH: {
    label: "High",
    className: "border-[#f2d1bd] bg-[#fff4ed] text-[#b54708]",
  },
  MEDIUM: {
    label: "Medium",
    className: "border-[#eadfb9] bg-[#fff9e5] text-[#8b6500]",
  },
  LOW: {
    label: "Low",
    className: "border-[#bfdfce] bg-[#effaf3] text-[#16834b]",
  },
  INFO: {
    label: "Info",
    className: "border-[#d8d8d3] bg-[#f7f7f4] text-[#686864]",
  },
};

export const ciStatusMeta: Record<CIRunStatus, { label: string; className: string }> = {
  QUEUED: {
    label: "Queued",
    className: "border-[#eadfb9] bg-[#fff8df] text-[#8b6500]",
  },
  RUNNING: {
    label: "Triaging",
    className: "border-[#cddcff] bg-[#edf3ff] text-[#2860c8]",
  },
  COMPLETED: {
    label: "Completed",
    className: "border-[#c6ead4] bg-[#edf9f1] text-[#167541]",
  },
  FAILED: {
    label: "Triage failed",
    className: "border-[#f3cccc] bg-[#fff0f0] text-[#c23c3c]",
  },
};

export const classificationMeta: Record<CiClassification, { label: string; className: string }> = {
  BUILD_ERROR: {
    label: "Build error",
    className: "border-[#efc1c1] bg-[#fff0f0] text-[#b42318]",
  },
  TEST_FAILURE: {
    label: "Test failure",
    className: "border-[#f2d1bd] bg-[#fff4ed] text-[#b54708]",
  },
  LINT: {
    label: "Lint",
    className: "border-[#eadfb9] bg-[#fff9e5] text-[#8b6500]",
  },
  TIMEOUT: {
    label: "Timeout",
    className: "border-[#cddcff] bg-[#edf3ff] text-[#2860c8]",
  },
  FLAKY: {
    label: "Flaky",
    className: "border-[#d0cfe8] bg-[#f4f3fc] text-[#5b5bb5]",
  },
  UNKNOWN: {
    label: "Unknown",
    className: "border-[#d8d8d3] bg-[#f7f7f4] text-[#686864]",
  },
};

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "Not finished";

  const milliseconds = new Date(value).getTime() - Date.now();
  const seconds = Math.round(milliseconds / 1_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  if (Math.abs(seconds) < 3_600) return formatter.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86_400) return formatter.format(Math.round(seconds / 3_600), "hour");
  return formatter.format(Math.round(seconds / 86_400), "day");
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDuration(startedAt: string | null | undefined, completedAt: string | null | undefined) {
  if (!startedAt || !completedAt) return "—";

  const milliseconds = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (milliseconds < 0) return "—";

  const seconds = Math.round(milliseconds / 1_000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function githubPullRequestUrl(repository: string, prNumber: number) {
  return `https://github.com/${repository}/pull/${prNumber}`;
}

export function githubWorkflowRunUrl(repository: string, workflowRunId: string) {
  return `https://github.com/${repository}/actions/runs/${workflowRunId}`;
}
