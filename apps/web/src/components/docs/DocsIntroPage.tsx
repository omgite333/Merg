import Link from "next/link";
import type { ReactNode } from "react";

function CodeBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="my-5 overflow-hidden rounded-xl border border-[#e5e5e0] bg-[#fafaf7] dark:border-white/10 dark:bg-[#16161d]">
      <p className="flex items-center gap-2 border-b border-[#e5e5e0] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8b8b85] dark:border-white/10 dark:text-[#7c7c86]">
        <span className="grid size-3.5 place-items-center rounded-full border border-[#d5d5cf] text-[8px] dark:border-white/15">◈</span>
        {title}
      </p>
      <pre className="overflow-x-auto px-4 py-3.5 text-[12.5px] leading-6 text-[#3e3e39] dark:text-[#d3d3d5]">{children}</pre>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-[#20201e] dark:text-white">{title}</h2>
      <div className="mt-4 space-y-4 text-[14px] leading-7 text-[#55554f] dark:text-[#a1a1aa]">{children}</div>
    </section>
  );
}

const pipeline: { step: string; title: string; body: string }[] = [
  {
    step: "1",
    title: "Webhook intake",
    body: "When a pull request is opened or updated, GitHub sends a webhook to the Merg server. The signature is verified, the commit is checked against existing reviews (dedup), and a QUEUED review session is created before a job is added to the queue.",
  },
  {
    step: "2",
    title: "Queue + retries",
    body: "Jobs run through a Redis-backed BullMQ queue with retries and exponential backoff, so a transient GitHub or model outage doesn't mark a review as failed.",
  },
  {
    step: "3",
    title: "Specialist agents",
    body: "The worker fetches the changed files plus full file context, filters out lockfiles and generated code, and runs three specialist agents in parallel via a LangGraph state graph: code correctness, security, and performance.",
  },
  {
    step: "4",
    title: "Merge findings per line",
    body: "If two agents flag the same line, findings are merged — highest severity wins, messages are combined, and blocking is OR'd — so the author sees one actionable comment instead of overlapping noise.",
  },
  {
    step: "5",
    title: "Post to GitHub",
    body: "Each finding is posted as an inline comment with a title, severity badge, and a concrete suggested fix. A PR-level summary comment (REQUEST_CHANGES, COMMENT, or APPROVE) and a GitHub Check Run gate are also posted.",
  },
  {
    step: "6",
    title: "Persist + dashboard",
    body: "Findings, comments, and the summary are stored in Postgres and surface in the dashboard, where you can browse repositories, reviews, and inline findings with severity breakdowns.",
  },
];

export function DocsIntroPage() {
  return (
    <article className="max-w-[720px]">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#2764d8]">Introduction</p>
      <h1 className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.06em] text-[#171717] dark:text-white sm:text-[44px]">
        How Merg works.
      </h1>
      <p className="mt-5 text-[16px] leading-8 text-[#55554f] dark:text-[#a1a1aa]">
        Merg is an open-source GitHub App that reviews every pull request with specialized AI
        agents. Install it, connect your repositories, and open a PR — Merg reads the diff,
        flags issues inline on the changed lines, and leaves a clear path to merge.
      </p>

      <div className="my-12 space-y-14">
        <Section id="overview" title="What the website does">
          <p>
            The dashboard is the control center for your installations. Sign in with your GitHub
            account and you can:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>See every repository connected across your GitHub installations.</li>
            <li>Track the full lifecycle of each review — queued, running, completed, or failed.</li>
            <li>Open any review to view the synthesized summary, a severity breakdown, and the exact inline findings with suggested fixes.</li>
            <li>Add repositories, manage settings, and jump straight to the PR on GitHub.</li>
          </ul>
          <p>
            Behind the scenes, three components work together: an Express server that receives
            GitHub webhooks, a worker that runs the review agents, and this Next.js app that
            serves the landing page, docs, and dashboard.
          </p>
        </Section>

        <Section id="how-it-works" title="The review pipeline">
          <p>Here is the end-to-end flow from opening a PR to the review landing on GitHub:</p>
          {pipeline.map((item) => (
            <div key={item.title} className="flex gap-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#edf3ff] text-[12px] font-bold text-[#2764d8] dark:bg-white/10 dark:text-[#7fb0ff]">
                {item.step}
              </span>
              <div>
                <p className="text-[14px] font-semibold text-[#33332f] dark:text-[#e2e2e1]">{item.title}</p>
                <p className="mt-1 text-[14px] leading-7 text-[#55554f] dark:text-[#a1a1aa]">{item.body}</p>
              </div>
            </div>
          ))}
        </Section>

        <Section id="agents" title="The review agents">
          <p>
            Each PR is reviewed in parallel by three specialist agents, each with its own
            expertise and false-positive budget. Every finding must be grounded in a specific
            changed line — no generic nitpicks.
          </p>
          <ul className="space-y-2">
            <li>
              <span className="font-semibold text-[#33332f] dark:text-[#e2e2e1]">Code correctness — </span>
              logic bugs, race conditions, missing awaits, null crashes, and API misuse.
            </li>
            <li>
              <span className="font-semibold text-[#33332f] dark:text-[#e2e2e1]">Security — </span>
              injection, auth bypass, IDOR, secrets in logs, SSRF, path traversal, and XSS, each with a concrete attack path.
            </li>
            <li>
              <span className="font-semibold text-[#33332f] dark:text-[#e2e2e1]">Performance — </span>
              N+1 queries, missing indexes, blocking the event loop, unbounded fetches, and O(n²) hot paths, each with a scale estimate.
            </li>
          </ul>
          <p>
            Agents emit a scratchpad plus validated JSON, then findings are merged per line,
            de-duplicated, and posted. Blocking findings produce a <code className="rounded border border-[#e5e5e0] bg-[#f3f3ef] px-1.5 py-0.5 text-[12px] text-[#44443f] dark:border-white/10 dark:bg-white/5 dark:text-[#d3d3d5]">REQUEST_CHANGES</code> verdict and a failing Check Run; a clean review approves automatically.
          </p>
        </Section>

        <Section id="dashboard" title="Using the dashboard">
          <p>
            Sign in with GitHub (OAuth) to open the dashboard. The overview shows active
            repositories, reviews in progress, completed reviews, and recent findings. Review
            pages auto-refresh while a review is running and link back to the PR on GitHub.
          </p>
          <p>
            Access is scoped to the installations GitHub grants your account — you only see the
            repositories you’re allowed to see.
          </p>
        </Section>

        <Section id="configuration" title="Per-repository configuration">
          <p>
            Add a <code className="rounded border border-[#e5e5e0] bg-[#f3f3ef] px-1.5 py-0.5 text-[12px] text-[#44443f] dark:border-white/10 dark:bg-white/5 dark:text-[#d3d3d5]">.merg.yml</code> file to the root of a repository to tune the review:
          </p>
          <CodeBlock title="yaml">
{`# .merg.yml
agents:
  code_quality: true
  security: true
  performance: true

ignore:
  - "**/*.test.ts"
  - "migrations/**"
  - "*.generated.*"

severity_threshold: warning`}
          </CodeBlock>
          <p>
            Lockfiles, build output, and vendored code are always filtered out before anything
            is sent to the agents.
          </p>
        </Section>

        <Section id="api" title="API endpoints">
          <p>The server exposes a small JSON API consumed by the dashboard:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><code className="rounded border border-[#e5e5e0] bg-[#f3f3ef] px-1.5 py-0.5 text-[12px] text-[#44443f] dark:border-white/10 dark:bg-white/5 dark:text-[#d3d3d5]">POST /webhook</code> — GitHub webhook receiver (signature-verified).</li>
            <li><code className="rounded border border-[#e5e5e0] bg-[#f3f3ef] px-1.5 py-0.5 text-[12px] text-[#44443f] dark:border-white/10 dark:bg-white/5 dark:text-[#d3d3d5]">GET /api/dashboard</code> — installations with their repositories and recent reviews.</li>
            <li><code className="rounded border border-[#e5e5e0] bg-[#f3f3ef] px-1.5 py-0.5 text-[12px] text-[#44443f] dark:border-white/10 dark:bg-white/5 dark:text-[#d3d3d5]">GET /api/reviews</code> — paginated review sessions.</li>
            <li><code className="rounded border border-[#e5e5e0] bg-[#f3f3ef] px-1.5 py-0.5 text-[12px] text-[#44443f] dark:border-white/10 dark:bg-white/5 dark:text-[#d3d3d5]">GET /api/reviews/:id</code> — a single review with all findings.</li>
          </ul>
          <p>Dashboard endpoints require a valid session cookie and are scoped to the caller’s installations.</p>
        </Section>

        <Section id="project" title="Project information">
          <p>Merg is a Turborepo + Bun monorepo, written entirely in TypeScript:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><span className="font-semibold text-[#33332f] dark:text-[#e2e2e1]">apps/server</span> — Express 5 webhook receiver + queue producer.</li>
            <li><span className="font-semibold text-[#33332f] dark:text-[#e2e2e1]">apps/worker</span> — BullMQ consumer running the LangGraph review agents.</li>
            <li><span className="font-semibold text-[#33332f] dark:text-[#e2e2e1]">apps/web</span> — Next.js landing page, docs, and dashboard.</li>
            <li><span className="font-semibold text-[#33332f] dark:text-[#e2e2e1]">packages/database</span> — Prisma schema, migrations, and generated client.</li>
          </ul>
          <p>
            Stack: TypeScript, Next.js 16, React 19, Tailwind CSS v4, Express 5, LangGraph +
            Groq, BullMQ over Redis, PostgreSQL + Prisma. Published PR reviews use the model
            provider you configure — bring your own key, keep control.
          </p>
          <p>
            Current status is a working MVP. Source and issues live on{" "}
            <Link href="https://github.com/omgite333/Merg" target="_blank" rel="noreferrer" className="font-semibold text-[#2764d8] hover:text-[#174cae]">GitHub</Link>.
          </p>
        </Section>
      </div>
    </article>
  );
}