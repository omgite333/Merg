const MAX_LOG_CHARS = 6000; // keep the triage prompt small — full CI logs alone can blow the whole Groq TPM budget

export type FailedJob = { id: number; name: string; logExcerpt: string };

export async function getFailedJobLogs(
  octokit: any,
  owner: string,
  repo: string,
  runId: number
): Promise<FailedJob[]> {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs", {
    owner,
    repo,
    run_id: runId,
  });

  const failedJobs = data.jobs.filter((job: any) => job.conclusion === "failure");
  const results: FailedJob[] = [];

  for (const job of failedJobs) {
    try {
      const response = await octokit.request(
        "GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs",
        { owner, repo, job_id: job.id }
      );
      const fullLog = normalizeLog(response.data);
      results.push({ id: job.id, name: job.name, logExcerpt: trimLog(fullLog) });
    } catch (err: any) {
      console.error(`Failed to fetch logs for job ${job.id}:`, err.message);
    }
  }

  return results;
}

function normalizeLog(data: any): string {
  if (typeof data === "string") return data;
  if (data instanceof Uint8Array) return Buffer.from(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return String(data);
}

// GitHub Actions prefixes real errors with "##[error]" in the raw log —
// pull those lines plus surrounding context first. Fall back to the tail
// of the log (where failures usually surface anyway) if none are found.
function trimLog(log: string): string {
  const lines = log.split("\n");
  const errorLineIndexes = lines
    .map((line, i) => (line.includes("##[error]") ? i : -1))
    .filter((i) => i !== -1);

  if (errorLineIndexes.length > 0) {
    const excerptLines: string[] = [];
    for (const idx of errorLineIndexes) {
      const start = Math.max(0, idx - 15);
      const end = Math.min(lines.length, idx + 5);
      excerptLines.push(...lines.slice(start, end), "...");
    }
    const excerpt = excerptLines.join("\n");
    return excerpt.length > MAX_LOG_CHARS ? excerpt.slice(-MAX_LOG_CHARS) : excerpt;
  }

  return lines.slice(-120).join("\n").slice(-MAX_LOG_CHARS);
}