import express from "express";
import "dotenv/config";
import { Webhooks } from "@octokit/webhooks";

import { reviewQueue } from "./queue";
import { prisma } from "@repo/database";

const app = express();
const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
});

// capture raw body — signature verification needs the exact bytes GitHub sent
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

app.post("/webhook", async (req, res) => {
  const signature = req.headers["x-hub-signature-256"] as string;
  const valid = await webhooks.verify((req as any).rawBody, signature);
  if (!valid) return res.status(401).send("Invalid signature");


  const event = req.headers["x-github-event"];
  const action = req.body.action;

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
  });

  console.log(`Queued review ${session.id} for PR #${pull_request.number}`);
}

res.sendStatus(200);

});

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});