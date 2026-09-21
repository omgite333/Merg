import type { Finding } from "./llm";

const CHECK_NAME = "Merg PR review";

interface CheckRunInput {
  octokit: any;
  owner: string;
  repo: string;
  headSha: string;
  findings: Finding[];
  reviewBody: string;
}

/**
 * Creates (or updates) a GitHub Check Run on the head commit as a
 * pass/fail gate: success when clean, neutral when only minor findings,
 * failure when anything is blocking. Requires the GitHub App to have
 * "Checks" write permission.
 */
export async function upsertCheckRun({ octokit, owner, repo, headSha, findings, reviewBody }: CheckRunInput) {
  const blockingCount = findings.filter((f) => f.blocking).length;
  const conclusion = blockingCount > 0 ? "failure" : findings.length === 0 ? "success" : "neutral";

  try {
    const { data: existing } = await octokit.request(
      "GET /repos/{owner}/{repo}/commits/{ref}/check-runs",
      { owner, repo, ref: headSha }
    );
    const run = existing.check_runs?.find((r: any) => r.name === CHECK_NAME);

    const output = {
      title: blockingCount ? "Merg found blocking issues" : findings.length ? "Merg found minor issues" : "Merg review passed",
      summary: `${findings.length} ${findings.length === 1 ? "finding" : "findings"} · ${blockingCount} blocking`,
      text: reviewBody,
    };

    if (run) {
      await octokit.request("PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}", {
        owner,
        repo,
        check_run_id: run.id,
        status: "completed",
        conclusion,
        output,
      });
    } else {
      await octokit.request("POST /repos/{owner}/{repo}/check-runs", {
        owner,
        repo,
        name: CHECK_NAME,
        head_sha: headSha,
        status: "completed",
        conclusion,
        output,
      });
    }
  } catch (err: any) {
    console.error(`Failed to post ${CHECK_NAME} check run for ${owner}/${repo}@${headSha}:`, err.message);
  }
}