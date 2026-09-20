# Merg

<div align="center">

**AI code review for every pull request.**

Merg reads every PR with focused AI agents, explains what matters, and leaves your team with a clear path to merge.

![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178c6?style=flat-square&logo=typescript)
![Bun](https://img.shields.io/badge/Bun-1.3-f9f9f9?style=flat-square&logo=bun)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js)
![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express)
![Prisma](https://img.shields.io/badge/Prisma-6-2d3748?style=flat-square&logo=prisma)
![Turborepo](https://img.shields.io/badge/Turborepo-2-ef4444?style=flat-square&logo=turborepo)

</div>

## What is Merg?

Merg is an **open source GitHub App that reviews pull requests automatically**. Install it, select your repositories, and open a PR — Merg listens for the GitHub webhook, runs a team of specialized AI review agents over the diff, posts findings **inline on the changed lines**, and leaves a concise review summary in the PR conversation.

It is built around three principles:

- **Evidence grounding** — every finding must be anchored to a concrete changed line. No generic nitpicking, no hallucinated issues.
- **Specialist agents, not one big prompt** — code correctness, security, and performance are reviewed in parallel by dedicated agents with their own expertise and calibrated false-positive thresholds.
- **Your provider, your key** — pool reviews through the model account you already use (Groq, Gemini, Claude, ChatGPT, Grok, Z.ai, or any OpenAI-compatible endpoint). Merg brings the workflow and context; you keep the key, the billing, and the control.

## Key features

- **Multi-agent parallel review** — three specialist agents (quality, security, performance) analyze the same diff simultaneously via LangGraph.
- **Inline diff comments** — findings are posted as line-level review comments on the exact lines that changed, with the flagged code and a concrete suggested fix.
- **Blocking-aware verdicts** — a `REQUEST_CHANGES`, `COMMENT`, or `APPROVE` review is posted automatically based on whether any finding is blocking (`MERGE` gate is configurable).
- **Deduplication** — the same commit is never reviewed twice (`owner/repo/PR/commit_SHA` uniqueness), so pushes that haven't changed get skipped.
- **GitHub App integration** — webhooks trigger reviews; signatures are verified before anything is queued.
- **Unified dashboard** — a Next.js dashboard shows every repository and PR review across all your GitHub installations, with status, findings, and history.
- **Noise filtering** — lockfiles, build output, vendored code, and generated files are never sent to agents.
- **Bring your own key (BYOK)** — swap the model provider without touching the workflow.

## How it works

```
                    Pull request
                  opened / updated
                         │  GitHub webhook (X-Hub-Signature-256)
                         ▼
┌──────────────────────────────────┐
│  apps/server (Express)           │
│  • verify webhook signature      │
│  • dedupe by commit SHA          │
│  • upsert installation           │
│  • create ReviewSession (QUEUED) │
│  • enqueue job in BullMQ         │
└──────────────────────┬───────────┘
                       │  Redis
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  apps/worker (BullMQ worker)                                 │
│  • fetch PR files + full file context at the commit SHA      │
│  • filter out lockfiles / build / generated files            │
│  • for each file, run LangGraph review graph                 │
│                                                              │
│        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  START→│ code.agent   │→│ merge        │  │ security.agent │→│
│        │ (correctness)│  │ (by line)    │  │ (exploitable)  │...│
│        └──────────────┘  └──────────────┘  │ performance   │  │
│                              merge ────────│  (N+1, hot… ) │  │
│  • summarize all findings (summary.agent)  └──────────────┘  │
│  • post inline comments + review to GitHub                   │
│  • persist findings to Postgres (Prisma)                     │
└──────────────────────────────────────────────────────────────┘
                       │
                       ▼
        GitHub PR: line comments + summary review
        Dashboard: apps/web reads /api/dashboard
```

**The review graph** (`apps/worker/src/graph/review.graph.ts`) merges findings from all three agents back onto the same line: if two agents flag the same line, the highest severity wins, messages are combined, and blocking is OR'd — so the author sees one actionable comment, not three overlapping ones.

## Repository structure

```
apps/
  server/     Express API + GitHub webhook receiver + BullMQ producer (queue)
  worker/     BullMQ consumer running the LangGraph review agents
  web/        Next.js app: landing page, dashboard, docs, legal pages
packages/
  database/   Prisma schema, migrations, and generated client
  ui/         Shared React component library
  eslint-config/  Shared ESLint configs
  typescript-config/ Shared tsconfig presets
```

## Tech stack

| Layer       | Technology                                                        |
| ----------- | ----------------------------------------------------------------- |
| Language    | TypeScript (100% across the monorepo)                             |
| Monorepo    | Turborepo + Bun workspaces                                        |
| Orchestration | LangGraph (langgraph StateGraph) over LangChain + Groq           |
| Queue       | BullMQ over Redis (ioredis)                                       |
| API server  | Express 5, `@octokit/webhooks` signature verification             |
| GitHub auth | GitHub App via `@octokit/app` + `@octokit/auth-app`               |
| Database    | PostgreSQL + Prisma                                                |
| Web app     | Next.js 16, React 19, Tailwind CSS v4                             |

## Getting started

### Prerequisites

- [Bun](https://bun.com) ≥ 1.3
- [Node.js](https://nodejs.org) ≥ 24
- A running [Redis](https://redis.io) instance
- A PostgreSQL database (local or hosted — any Prisma-supported Postgres works)
- A GitHub App (see below)

### Install dependencies

```sh
bun install
```

### Environment variables

Copy the `.env` template into each app/package (or create the files) with your own values. **Never commit real secrets.**

**`apps/server/.env`, `apps/worker/.env`**

| Variable                    | Description                                                       |
| --------------------------- | ----------------------------------------------------------------- |
| `PORT`                      | HTTP port for the server (default `8000`)                          |
| `REDIS_URL`                 | Redis connection URL (BullMQ)                                      |
| `DATABASE_URL`              | PostgreSQL connection string                                       |
| `GITHUB_WEBHOOK_SECRET`     | Secret configured on your GitHub App (used to verify webhooks)     |
| `GITHUB_APP_ID`             | GitHub App ID                                                      |
| `GITHUB_PRIVATE_KEY_PATH`   | Path to your GitHub App private key (`.pem`)                       |
| `GROQ_API_KEY`              | Groq API key for the review agents (swap for BYOK provider)        |

**`packages/database/.env`**

| Variable      | Description                         |
| ------------- | ----------------------------------- |
| `DATABASE_URL`| PostgreSQL connection string        |

### Database

```sh
bun run --filter @repo/database db:generate   # generate the Prisma client
bun run --filter @repo/database db:migrate:deploy  # apply migrations
```

### Run in development

```sh
bun run dev
```

`turbo run dev` starts all three apps together:

- **web** → http://localhost:3000
- **server** → http://localhost:8000 (webhook endpoint: `POST /webhook`)
- **worker** — listens for BullMQ `pr-review` jobs

You can also run/develop a single app:

```sh
turbo dev --filter=server
turbo dev --filter=worker
turbo dev --filter=web
```

Other useful commands:

```sh
turbo build          # build all apps and packages
turbo lint           # lint everything
bun run check-types  # typecheck everything (tsc --noEmit)
bun run format       # format code with Prettier
```

### Setting up the GitHub App

1. Create a GitHub App (Settings → Developer settings → GitHub Apps).
2. Enable the **Pull request** webhook events (`opened`, `synchronize`).
3. Set the webhook URL to `https://<your-domain>/webhook` and copy the webhook secret into `.env`.
4. Grant read access to pull requests and file contents, plus write access to PR reviews and comments.
5. Generate a private key and point `GITHUB_PRIVATE_KEY_PATH` at it.
6. Install the app on the repositories you want reviewed.

With the server running, opening a PR on a selected repository triggers an automatic review.

## Configuration

Per-repository configuration is documented in the docs site (`/docs`):

```yaml
# .merg.yml at the root of the repo you want to configure
agents:
  code_quality: true
  security: true
  performance: true

ignore:
  - "**/*.test.ts"
  - "migrations/**"
  - "*.generated.*"

severity_threshold: warning
```

## API

The server exposes a small JSON API consumed by the dashboard:

| Method | Path              | Description                                           |
| ------ | ----------------- | ----------------------------------------------------- |
| `GET`  | `/api/dashboard`  | All GitHub installations with their repositories and recent reviews |
| `GET`  | `/api/reviews`    | Paginated list of review sessions (default 20/page)    |
| `GET`  | `/api/reviews/:id`| Single review session incl. all findings               |

Reviews carry a status lifecycle: `QUEUED → RUNNING → COMPLETED | FAILED`, and each finding is categorized by `severity` (`critical`…`info`) and `category` (`bug`, `security`, `performance`, `style`, …).

## How the agents are designed

Each agent prompt enforces a strict discipline:

- **Diff-scope only** — issues must be introduced or worsened by lines with a `+` prefix. Pre-existing problems stay out.
- **Certainty calibration** — uncertain findings are phrased as questions at `LOW` severity with `blocking: false`.
- **False-positive budget** — a wrong comment costs author trust; a missed real bug costs on-call hours. Agents are told to require higher confidence to post than to skip.
- **Blocking discipline** — `blocking: true` is reserved for things that must be fixed before merge.
- **Concrete output** — findings include the verbatim problematic code and a written-out suggested fix, never a description of one.
- **Scratchpad parsing** — models emit a `<scratchpad>` block followed by raw JSON, which is extracted and validated before anything is posted.

## Project status

Current state is a working **MVP**: webhook intake → queued review → agent graph → GitHub comments/summary → persisted history → dashboard. Roadmap per the docs includes per-repo rule configuration, severity thresholds, agent toggles, and broader provider support (BYOK).

## License

Open source. Contributions, issues, and ideas are welcome — ask questions or open issues on the repo, or learn more at [merg.xyz](https://merg.xyz).