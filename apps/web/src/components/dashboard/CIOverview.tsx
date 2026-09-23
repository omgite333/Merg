"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert02Icon,
  ArrowUpRight01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Refresh01Icon,
  ScanSearchIcon,
  SparklesIcon,
  WorkflowSquare02Icon,
} from "@hugeicons/core-free-icons";
import { getCiStats } from "@/lib/api";
import { formatRelativeTime, githubWorkflowRunUrl } from "@/lib/dashboard";
import type { CiClassification, CiStatsResponse } from "@/types/dashboard";
import { ClassificationBadge, DashboardIcon, DashboardLoading, EmptyPanel, MetricCard } from "./DashboardPrimitives";

const classificationOrder: CiClassification[] = [
  "BUILD_ERROR",
  "TEST_FAILURE",
  "LINT",
  "TIMEOUT",
  "FLAKY",
  "UNKNOWN",
];

export function CIOverview() {
  const [data, setData] = useState<CiStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    try {
      const nextData = await getCiStats();
      setData(nextData);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load CI triage overview.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    getCiStats()
      .then((nextData) => {
        if (!cancelled) {
          setData(nextData);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load CI triage overview.");
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
  }, []);

  const stats = data?.stats;

  const classificationBreakdown = useMemo(
    () =>
      classificationOrder
        .map((classification) => ({ classification, count: stats?.byClassification[classification] ?? 0 }))
        .filter(({ count }) => count > 0)
        .sort((left, right) => right.count - left.count),
    [stats]
  );

  const totalClassified = useMemo(
    () => classificationBreakdown.reduce((total, { count }) => total + count, 0),
    [classificationBreakdown]
  );

  if (loading && !data) {
    return <DashboardLoading label="Loading CI triage overview" />;
  }

  if (error && !data) {
    return (
      <EmptyPanel
        title="CI triage overview is unavailable"
        description="Check that the Merg API is running, then try again."
        action={
          <button onClick={() => void loadStats()} type="button" className="rounded-full bg-[#20201e] px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#343430]">
            Try again
          </button>
        }
      />
    );
  }

  const inProgress = (stats?.byStatus.QUEUED ?? 0) + (stats?.byStatus.RUNNING ?? 0);

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#2764d8]">CI triage overview</p>
          <h1 className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.06em] text-[#20201e] dark:text-white sm:text-[38px]">Failed builds, explained.</h1>
          <p className="mt-3 max-w-xl text-[14px] leading-6 text-[#73736e] dark:text-[#a1a1aa]">Every triaged workflow run, classified by root cause with a summary posted right to the pull request.</p>
        </div>
        <button onClick={() => void loadStats(true)} type="button" disabled={refreshing} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-[#ddddD7] bg-white dark:border-white/10 dark:bg-[#14141a] px-4 text-[12px] font-semibold text-[#4b4b46] dark:text-[#d3d3d5] transition-colors hover:border-[#bfbfb8] hover:bg-[#f7f7f4] dark:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60">
          <DashboardIcon icon={Refresh01Icon} size={14} className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
          Refresh
        </button>
      </section>

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[#f2d1d1] bg-[#fff6f6] px-4 py-3 text-[13px] text-[#a53d3d]">
          <DashboardIcon icon={Alert02Icon} size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>Showing your last loaded overview. Refresh failed: {error}</p>
        </div>
      ) : null}

      {stats && stats.total === 0 ? (
        <EmptyPanel
          title="No workflow runs triaged yet"
          description="When a workflow run fails in a connected repository, Merg classifies the root cause and posts the summary to the pull request."
          action={
            <Link href="/dashboard/ci" className="inline-flex items-center gap-2 rounded-full bg-[#20201e] px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#343430]">
              View CI triage <DashboardIcon icon={ArrowUpRight01Icon} size={14} aria-hidden="true" />
            </Link>
          }
        />
      ) : null}

      {stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Runs triaged" value={stats.total} hint="Workflow failures triaged across connected repositories" icon={<DashboardIcon icon={WorkflowSquare02Icon} size={18} aria-hidden="true" />} />
            <MetricCard label="Triaging now" value={inProgress} hint="Queued or actively being triaged right now" icon={<DashboardIcon icon={Clock01Icon} size={18} aria-hidden="true" />} accent="blue" />
            <MetricCard label="Needs attention" value={stats.byStatus.FAILED} hint="Triages that failed before posting a summary" icon={<DashboardIcon icon={Alert02Icon} size={18} aria-hidden="true" />} accent={stats.byStatus.FAILED ? "red" : "green"} />
            <MetricCard label="Comments posted" value={stats.postedComments} hint="Root-cause summaries posted to pull requests" icon={<DashboardIcon icon={CheckmarkCircle02Icon} size={18} aria-hidden="true" />} accent="green" />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.8fr)]">
            <section className="overflow-hidden rounded-2xl border border-[#e5e5e0] bg-white dark:border-white/10 dark:bg-[#14141a] shadow-[0_8px_24px_rgba(23,23,23,0.035)]">
              <div className="flex items-center justify-between gap-4 border-b border-[#ecece7] px-5 py-4 sm:px-6">
                <div>
                  <h2 className="text-[15px] font-semibold tracking-[-0.025em]">Recent triages</h2>
                  <p className="mt-1 text-[12px] text-[#83837d] dark:text-[#b8b8c0]">The latest workflow failures from your connected repositories.</p>
                </div>
                <Link href="/dashboard/ci" className="shrink-0 text-[12px] font-semibold text-[#2764d8] hover:text-[#174cae]">View all</Link>
              </div>

              {stats.recent.length ? (
                <div className="divide-y divide-[#efefeb] dark:divide-white/10">
                  {stats.recent.slice(0, 7).map((run) => (
                    <div key={run.id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-[#fcfcfa] dark:bg-[#101016] dark:hover:bg-white/5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0f4ff] text-[#2764d8]">
                          <DashboardIcon icon={WorkflowSquare02Icon} size={16} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="truncate text-[13px] font-semibold text-[#33332f] dark:text-[#e2e2e1]">{run.repository.fullName}</p>
                            <span className="text-[12px] text-[#8b8b85] dark:text-[#b8b8c0]">{run.workflowName}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <ClassificationBadge classification={run.classification} />
                            <p className="text-[12px] text-[#85857f] dark:text-[#9a9aa3]">Run #{run.workflowRunId} · {run.pullNumber ? `PR #${run.pullNumber}` : run.headSha.slice(0, 7)} · {formatRelativeTime(run.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <div className="flex items-center gap-1">
                          <Link href={`/dashboard/ci/${run.id}`} className="rounded-lg p-2 text-[#74746f] dark:text-[#c2c2c9] transition-colors hover:bg-[#f1f1ed] hover:text-[#2764d8]" aria-label={`View triage for workflow run ${run.workflowRunId}`}>
                            <DashboardIcon icon={ArrowUpRight01Icon} size={14} aria-hidden="true" />
                          </Link>
                          <a href={githubWorkflowRunUrl(run.repository.fullName, run.workflowRunId)} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-[#74746f] dark:text-[#c2c2c9] transition-colors hover:bg-[#f1f1ed] hover:text-[#2764d8]" aria-label={`Open workflow run ${run.workflowRunId} on GitHub`}>
                            <DashboardIcon icon={WorkflowSquare02Icon} size={14} aria-hidden="true" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-12 text-center">
                  <DashboardIcon icon={ScanSearchIcon} size={20} className="mx-auto text-[#a3a39d] dark:text-[#a9a9b1]" aria-hidden="true" />
                  <p className="mt-3 text-[13px] font-medium text-[#4d4d48] dark:text-[#d3d3d5]">No recent triages yet.</p>
                  <p className="mt-1 text-[12px] leading-5 text-[#898983] dark:text-[#b8b8c0]">Fail a workflow in a connected repository and Merg will classify it for you.</p>
                </div>
              )}
            </section>

            <div className="space-y-5">
              <section className="rounded-2xl border border-[#e5e5e0] bg-white dark:border-white/10 dark:bg-[#14141a] p-5 shadow-[0_8px_24px_rgba(23,23,23,0.035)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold text-[#30302c] dark:text-[#f0f0ef]">Root cause breakdown</p>
                    <p className="mt-1 text-[12px] text-[#85857f] dark:text-[#9a9aa3]">How classified failures break down</p>
                  </div>
                  <DashboardIcon icon={ScanSearchIcon} size={16} className="text-[#2764d8]" aria-hidden="true" />
                </div>
                {classificationBreakdown.length ? (
                  <div className="mt-4 space-y-3">
                    {classificationBreakdown.map(({ classification, count }) => (
                      <div key={classification}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-[12px] font-medium text-[#494944] dark:text-[#d3d3d5]">{classificationMetaLabel(classification)}</p>
                          <span className="shrink-0 text-[10px] font-semibold text-[#757570] dark:text-[#c2c2c9]">{count}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f1f1ed] dark:bg-white/10">
                          <div className={cnClassificationBar(classification)} style={{ width: `${totalClassified ? (count / totalClassified) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl bg-[#f8f8f5] px-4 py-6 text-center">
                    <DashboardIcon icon={SparklesIcon} size={16} className="mx-auto text-[#a3a39d] dark:text-[#a9a9b1]" aria-hidden="true" />
                    <p className="mt-2 text-[12px] leading-5 text-[#85857f] dark:text-[#9a9aa3]">No classified failures yet.</p>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-[#e5e5e0] bg-white dark:border-white/10 dark:bg-[#14141a] p-5 shadow-[0_8px_24px_rgba(23,23,23,0.035)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold text-[#30302c] dark:text-[#f0f0ef]">Why we triage</p>
                    <p className="mt-1 text-[12px] text-[#85857f] dark:text-[#9a9aa3]">Right in the pull request</p>
                  </div>
                </div>
                <p className="mt-3 text-[12px] leading-5 text-[#777771] dark:text-[#a1a1aa]">
                  Merg listens for failed workflow runs, classifies the root cause, and posts a summary comment to the pull request so the whole team knows what broke and where to look — no digging through build logs.
                </p>
                <Link href="/dashboard/ci" className="mt-4 inline-flex text-[12px] font-semibold text-[#2764d8] hover:text-[#174cae]">View triage history <span className="ml-1">→</span></Link>
              </section>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function classificationMetaLabel(classification: CiClassification) {
  switch (classification) {
    case "BUILD_ERROR":
      return "Build error";
    case "TEST_FAILURE":
      return "Test failure";
    case "LINT":
      return "Lint";
    case "TIMEOUT":
      return "Timeout";
    case "FLAKY":
      return "Flaky";
    case "UNKNOWN":
      return "Unknown";
  }
}

function cnClassificationBar(classification: CiClassification) {
  const classes: Record<CiClassification, string> = {
    BUILD_ERROR: "bg-[#e05b5b]",
    TEST_FAILURE: "bg-[#ee8a4c]",
    LINT: "bg-[#d9a928]",
    TIMEOUT: "bg-[#5b8ff7]",
    FLAKY: "bg-[#8b86d9]",
    UNKNOWN: "bg-[#a1a19b]",
  };
  return classes[classification];
}