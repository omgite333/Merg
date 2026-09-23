import express from "express";
import "dotenv/config";
import cors from "cors";
import { Webhooks } from "@octokit/webhooks";

import { reviewQueue, ciTriageQueue } from "./queue";
import { apiRouter } from "./api";
import { prisma } from "@repo/database";

const app = express();
const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
});

// Restricted, not `cors()` with no args — that reflects any origin. With
// credentials (our session cookie) enabled, an open origin would let any
// website read a logged-in user's dashboard data via their browser.
app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  })
);

app.use(   // capture raw body — signature verification needs the exact bytes GitHub sent
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

app.use("/api", apiRouter);




app.post("/webhook", async (req, res) => {
  const signature = req.headers["x-hub-signature-256"] as string;
  const valid = await webhooks.verify((req as any).rawBody, signature);
  if (!valid) return res.status(401).send("Invalid signature");


  const event = req.headers["x-github-event"];
  const action = req.body.action;

if (event === "installation") {
  const { installation } = req.body;

  if (action === "created") {
    await prisma.installation.upsert({
      where: { githubInstallId: installation.id },
      update: { account: installation.account?.login ?? "" },
      create: { githubInstallId: installation.id, account: installation.account?.login ?? "" },
    });
    console.log(`Installation created: ${installation.id}`);
  } else if (action === "deleted") {
    await prisma.installation
      .delete({ where: { githubInstallId: installation.id } })
      .catch((err) => console.error(`Failed to remove installation ${installation.id}:`, err.message));
    console.log(`Installation deleted: ${installation.id}`);
  }

  return res.sendStatus(200);
}

if (event === "pull_request" && ["opened", "synchronize"].includes(action)) {
  const { pull_request, repository, installation } = req.body;

  const existing = await prisma.reviewSession.findUnique({
    where: {
      owner_repo_pullNumber_commitSha: {
        owner: repository.owner.login,
        repo: repository.name,
        pullNumber: pull_request.number,
        commitSha: pull_request.head.sha,
      },
    },
  });

  if (existing) {
    console.log("Already reviewed this commit, skipping");
    return res.sendStatus(200);
  }

  const install = await prisma.installation.upsert({
    where: { githubInstallId: installation.id },
    update: {},
    create: { githubInstallId: installation.id, account: repository.owner.login },
  });

  const session = await prisma.reviewSession.create({
    data: {
      installationId: install.id,
      owner: repository.owner.login,
      repo: repository.name,
      pullNumber: pull_request.number,
      commitSha: pull_request.head.sha,
      status: "QUEUED",
    },
  });

  await reviewQueue.add("review", {
    sessionId: session.id,
    installationId: installation.id,
    owner: repository.owner.login,
    repo: repository.name,
    pullNumber: pull_request.number,
    commitSha: pull_request.head.sha,
    prTitle: pull_request.title,
  });

  console.log(`Queued review ${session.id} for PR #${pull_request.number}`);
}

if (event === "workflow_run" && action === "completed") {
  const { workflow_run, repository, installation } = req.body;

  // Only triage real failures — success/cancelled/skipped runs are noise.
  if (!["failure", "timed_out", "startup_failure"].includes(workflow_run.conclusion)) {
    return res.sendStatus(200);
  }

  const workflowRunId = BigInt(workflow_run.id);

  const existing = await prisma.cIRun.findUnique({ where: { workflowRunId } });
  if (existing) {
    console.log(`Already triaged workflow run #${workflow_run.id}, skipping`);
    return res.sendStatus(200);
  }

  const install = await prisma.installation.upsert({
    where: { githubInstallId: installation.id },
    update: {},
    create: { githubInstallId: installation.id, account: repository.owner.login },
  });

  // pull_requests[] is only populated for same-repo branches, not forks —
  // GitHub doesn't expose PR linkage for fork-triggered workflow runs. In
  // that case the triage result still gets stored, just can't be posted as
  // a PR comment (the worker falls back to a check run on the commit).
  const pullNumber: number | null = workflow_run.pull_requests?.[0]?.number ?? null;

  const ciRun = await prisma.cIRun.create({
    data: {
      installationId: install.id,
      owner: repository.owner.login,
      repo: repository.name,
      workflowRunId,
      workflowName: workflow_run.name,
      headSha: workflow_run.head_sha,
      pullNumber,
      status: "QUEUED",
    },
  });

  await ciTriageQueue.add("triage", {
    ciRunId: ciRun.id,
    installationId: installation.id,
    owner: repository.owner.login,
    repo: repository.name,
    workflowRunId: workflow_run.id,
    headSha: workflow_run.head_sha,
    pullNumber,
  });

  console.log(`Queued CI triage ${ciRun.id} for workflow run #${workflow_run.id} (${workflow_run.conclusion})`);
}

res.sendStatus(200);

});

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});