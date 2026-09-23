"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert02Icon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  HashIcon,
  Refresh01Icon,
  SparklesIcon,
  WorkflowSquare02Icon,
} from "@hugeicons/core-free-icons";
import { getCIRun } from "@/lib/api";
import { formatDateTime, formatRelativeTime, githubPullRequestUrl, githubWorkflowRunUrl } from "@/lib/dashboard";
import type { CIRunDetailResponse } from "@/types/dashboard";
import { CiStatusBadge, ClassificationBadge, DashboardIcon, DashboardLoading, EmptyPanel, MetricCard } from "./DashboardPrimitives";

export function CIRunDetailScreen({ ciRunId }: { ciRunId: string }) {
  const [data, setData] = useState<CIRunDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRun = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    try {
      const nextData = await getCIRun(ciRunId);
      setData(nextData);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this CI run.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ciRunId]);

  useEffect(() => {
    let cancelled = false;

    getCIRun(ciRunId)
      .then((nextData) => {
        if (!cancelled) {
          setData(nextData);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load this CI run.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ciRunId]);

  const activeRun = data?.ciRun.status === "QUEUED" || data?.ciRun.status === "RUNNING";

  useEffect(() => {
    if (!activeRun) return;

    const intervalId = window.setInterval(() => void loadRun(true), 5_000);
    return () => window.clearInterval(intervalId);
  }, [activeRun, loadRun]);

  if (loading && !data) {
    return <DashboardLoading label="Loading CI triage details" />;
  }

  if (error && !data) {
    return (
      <EmptyPanel
        title="This CI run could not be loaded"
        description={error === "CI_RUN_NOT_FOUND" ? "The CI run is unavailable, or it no longer exists." : "Check that the Merg API is running, then try again."}
        action={<button onClick={() => void loadRun()} type="button" className="rounded-full bg-[#20201e] px-4 py-2.5 text-[12px] font-semibold text-white">Try again</button>}
      />
    );
  }

  const ciRun = data?.ciRun;
  if (!ciRun) return null;

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-4">
        <Link href="/dashboard/ci" className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#686863] dark:text-[#c2c2c9] transition-colors hover:text-[#2764d8]"><DashboardIcon icon={ArrowLeft01Icon} size={14} aria-hidden="true" />Back to CI triage</Link>
        <button onClick={() => void loadRun(true)} type="button" disabled={refreshing} className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#ddddD7] bg-white dark:border-white/10 dark:bg-[#14141a] px-3.5 text-[12px] font-semibold text-[#4b4b46] dark:text-[#d3d3d5] transition-colors hover:border-[#bfbfb8] hover:bg-[#f7f7f4] dark:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60">
          <DashboardIcon icon={Refresh01Icon} size={14} className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error ? <div className="rounded-2xl border border-[#f2d1d1] bg-[#fff6f6] px-4 py-3 text-[13px] text-[#a53d3d]">Showing your last loaded CI run. Refresh failed: {error}</div> : null}

      <section className="rounded-2xl border border-[#e5e5e0] bg-white dark:border-white/10 dark:bg-[#14141a] p-5 shadow-[0_8px_24px_rgba(23,23,23,0.035)] sm:p-7">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#2764d8]">CI triage detail</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="truncate text-[28px] font-semibold leading-none tracking-[-0.06em] text-[#20201e] dark:text-white sm:text-[36px]">{ciRun.workflowName}</h1>
              <span className="text-[18px] font-medium text-[#8b8b85] dark:text-[#b8b8c0]">Run #{ciRun.workflowRunId}</span>
            </div>
            <p className="mt-3 text-[13px] font-medium text-[#5c5c56] dark:text-[#b8b8c0]">{ciRun.repository.fullName}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-[#777771] dark:text-[#a1a1aa]">
              <span className="inline-flex items-center gap-1.5"><DashboardIcon icon={HashIcon} size={14} aria-hidden="true" />{ciRun.headSha.slice(0, 8)}</span>
              <span>{ciRun.pullNumber ? `PR #${ciRun.pullNumber}` : "Not linked to a PR (e.g. fork or push)"}</span>
              <span>Created {formatDateTime(ciRun.createdAt)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <CiStatusBadge status={ciRun.status} />
            <ClassificationBadge classification={ciRun.classification} />
            <a href={githubWorkflowRunUrl(ciRun.repository.fullName, ciRun.workflowRunId)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#20201e] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[#343430]">
              Open on GitHub
              <DashboardIcon icon={ExternalLinkIcon} size={14} aria-hidden="true" />
            </a>
          </div>
        </div>

        {activeRun ? (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#cddcff] bg-[#f1f5ff] px-4 py-3 text-[13px] text-[#315baf]">
            <DashboardIcon icon={Refresh01Icon} size={16} className="mt-0.5 shrink-0 animate-spin" aria-hidden="true" />
            <p>Merg is still triaging this workflow run. This page refreshes automatically every five seconds.</p>
          </div>
        ) : null}

        {ciRun.status === "FAILED" ? (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#f2d1d1] bg-[#fff6f6] px-4 py-3 text-[13px] text-[#a53d3d]">
            <DashboardIcon icon={Alert02Icon} size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div><p className="font-semibold">This triage run needs attention.</p><p className="mt-1 leading-5">The CI worker could not finish classifying this failure. Check the worker logs; a new failing workflow run will trigger a fresh attempt.</p></div>
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Classification"
          value={ciRun.classification ? ciRun.classification.replaceAll("_", " ") : "Pending"}
          hint={ciRun.classification ? "Root-cause category assigned by the triage agent" : "Assigned once the triage completes"}
          icon={<DashboardIcon icon={SparklesIcon} size={18} aria-hidden="true" />}
          accent={ciRun.classification === "UNKNOWN" ? "orange" : ciRun.classification ? "green" : "blue"}
        />
        <MetricCard
          label="Linked pull request"
          value={ciRun.pullNumber ? `#${ciRun.pullNumber}` : "None"}
          hint={ciRun.pullNumber ? "Triage comment posted to this pull request" : "Fork runs and pushes aren't linked to a PR"}
          icon={<DashboardIcon icon={GitPullRequestIcon} size={18} aria-hidden="true" />}
          accent="blue"
        />
        <MetricCard
          label="Triage result"
          value={ciRun.postedCommentId ? "Posted" : ciRun.status === "COMPLETED" ? "Logged only" : "In flight"}
          hint={ciRun.postedCommentId ? `GitHub comment ID ${ciRun.postedCommentId}` : "Stored in the dashboard; check runs require the Checks permission"}
          icon={<DashboardIcon icon={CheckmarkCircle02Icon} size={18} aria-hidden="true" />}
          accent={ciRun.postedCommentId ? "green" : ciRun.status === "FAILED" ? "red" : "orange"}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.7fr)]">
        <section className="rounded-2xl border border-[#e5e5e0] bg-white dark:border-white/10 dark:bg-[#14141a] p-5 shadow-[0_8px_24px_rgba(23,23,23,0.035)] sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[#f0f4ff] text-[#2764d8]"><DashboardIcon icon={SparklesIcon} size={16} aria-hidden="true" /></span>
            <div><h2 className="text-[15px] font-semibold tracking-[-0.025em]">Triage summary</h2><p className="mt-0.5 text-[12px] text-[#85857f] dark:text-[#9a9aa3]">The classified explanation of why this run failed.</p></div>
          </div>
          <div className="mt-5 rounded-xl bg-[#fafaf7] px-4 py-4 text-[13px] leading-6 text-[#5c5c56] dark:bg-[#16161d] dark:text-[#c2c2c9] whitespace-pre-wrap">
            {ciRun.summary ?? (activeRun ? "Merg is reading the failing job logs." : "No summary was recorded for this run.")}
          </div>
        </section>

        <section className="rounded-2xl border border-[#e5e5e0] bg-white dark:border-white/10 dark:bg-[#14141a] p-5 shadow-[0_8px_24px_rgba(23,23,23,0.035)] sm:p-6">
          <h2 className="text-[15px] font-semibold tracking-[-0.025em]">Run details</h2>
          <p className="mt-1 text-[12px] text-[#85857f] dark:text-[#9a9aa3]">GitHub data captured when the run was enqueued.</p>
          <dl className="mt-5 space-y-4 text-[13px]">
            <div><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b8b85]">Workflow</dt><dd className="mt-1 font-medium text-[#41413c] dark:text-[#d3d3d5]">{ciRun.workflowName}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b8b85]">Run ID</dt><dd className="mt-1 font-mono text-[12px] text-[#41413c] dark:text-[#d3d3d5]">#{ciRun.workflowRunId}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b8b85]">Head commit</dt><dd className="mt-1 font-mono text-[12px] text-[#41413c] dark:text-[#d3d3d5]">{ciRun.headSha}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b8b85]">GitHub actor</dt><dd className="mt-1">
              {ciRun.pullNumber ? (
                <a href={githubPullRequestUrl(ciRun.repository.fullName, ciRun.pullNumber)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-[#2764d8] hover:text-[#174cae]">PR #{ciRun.pullNumber} <DashboardIcon icon={ExternalLinkIcon} size={13} aria-hidden="true" /></a>
              ) : (
                <span className="text-[#777771] dark:text-[#b8b8c0]">No linked pull request</span>
              )}
            </dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b8b85]">Created</dt><dd className="mt-1 font-medium text-[#41413c] dark:text-[#d3d3d5]">{formatDateTime(ciRun.createdAt)} · {formatRelativeTime(ciRun.createdAt)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="flex items-start gap-3 rounded-2xl border border-[#e5e5e0] bg-[#fcfcfa] px-5 py-4 text-[13px] leading-6 text-[#777771] dark:border-white/10 dark:bg-[#101016] dark:text-[#a1a1aa]">
        <DashboardIcon icon={WorkflowSquare02Icon} size={16} className="mt-0.5 shrink-0 text-[#2764d8]" aria-hidden="true" />
        <p>This run was triaged from the raw GitHub Actions logs. To re-triage, open the corresponding pull request or force another failing workflow run.</p>
      </section>
    </div>
  );
}