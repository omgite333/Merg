"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  ExternalLinkIcon,
  FilterIcon,
  Refresh01Icon,
  Search01Icon,
  WorkflowSquare02Icon,
} from "@hugeicons/core-free-icons";
import { getCIRuns, getDashboard } from "@/lib/api";
import { formatDateTime, formatRelativeTime, githubWorkflowRunUrl } from "@/lib/dashboard";
import type { CIRunStatus, CIRunsResponse, DashboardResponse, Repository } from "@/types/dashboard";
import { CiStatusBadge, ClassificationBadge, DashboardIcon, DashboardLoading, EmptyPanel } from "./DashboardPrimitives";

const ciStatuses: Array<{ value: "ALL" | CIRunStatus; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "QUEUED", label: "Queued" },
  { value: "RUNNING", label: "Triaging" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Triage failed" },
];

export function CIRunsScreen() {
  const [ciRunsData, setCiRunsData] = useState<CIRunsResponse | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"ALL" | CIRunStatus>("ALL");
  const [repositoryId, setRepositoryId] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    try {
      const [nextCiRuns, nextDashboard] = await Promise.all([getCIRuns(page), getDashboard()]);
      setCiRunsData(nextCiRuns);
      setDashboardData(nextDashboard);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load CI triage history.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getCIRuns(page), getDashboard()])
      .then(([nextCiRuns, nextDashboard]) => {
        if (!cancelled) {
          setCiRunsData(nextCiRuns);
          setDashboardData(nextDashboard);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load CI triage history.");
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
  }, [page]);

  const repositories = useMemo(
    () =>
      Array.from(
        (dashboardData?.installations ?? [])
          .flatMap((installation) => installation.repositories)
          .reduce((map, repository) => {
            if (!map.has(repository.id)) {
              map.set(repository.id, { ...repository, recentReviews: [...repository.recentReviews] });
            }
            return map;
          }, new Map<string, Repository>())
          .values()
      ),
    [dashboardData]
  );

  const filteredRuns = useMemo(() => {
    const term = search.trim().toLowerCase();

    return (ciRunsData?.ciRuns ?? []).filter((run) => {
      const matchesStatus = status === "ALL" || run.status === status;
      const matchesRepository = repositoryId === "ALL" || run.repository.fullName === repositoryId;
      const matchesSearch =
        !term ||
        run.repository.fullName.toLowerCase().includes(term) ||
        run.workflowName.toLowerCase().includes(term) ||
        `#${run.workflowRunId}`.includes(term);
      return matchesStatus && matchesRepository && matchesSearch;
    });
  }, [repositoryId, ciRunsData, search, status]);

  if (loading && !ciRunsData) {
    return <DashboardLoading label="Loading CI triage history" />;
  }

  if (error && !ciRunsData) {
    return (
      <EmptyPanel
        title="CI triage history is unavailable"
        description="Check that the Merg API is running, then try again."
        action={<button onClick={() => void load()} type="button" className="rounded-full bg-[#20201e] px-4 py-2.5 text-[12px] font-semibold text-white">Try again</button>}
      />
    );
  }

  const pagination = ciRunsData?.pagination;

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#2764d8]">CI triage</p>
          <h1 className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.06em] text-[#20201e] dark:text-white sm:text-[38px]">Failed builds, explained.</h1>
          <p className="mt-3 max-w-xl text-[14px] leading-6 text-[#73736e] dark:text-[#a1a1aa]">Every triaged workflow run, classified by root cause with a summary posted right to the pull request.</p>
        </div>
        <button onClick={() => void load(true)} type="button" disabled={refreshing} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-[#ddddD7] bg-white dark:border-white/10 dark:bg-[#14141a] px-4 text-[12px] font-semibold text-[#4b4b46] dark:text-[#d3d3d5] transition-colors hover:border-[#bfbfb8] hover:bg-[#f7f7f4] dark:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60">
          <DashboardIcon icon={Refresh01Icon} size={14} className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
          Refresh
        </button>
      </section>

      <section className="rounded-2xl border border-[#e5e5e0] bg-white dark:border-white/10 dark:bg-[#14141a] p-4 shadow-[0_8px_24px_rgba(23,23,23,0.035)] sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(180px,0.9fr)_minmax(180px,0.8fr)_minmax(0,1.3fr)]">
          <label className="relative block">
            <span className="sr-only">Filter CI runs by status</span>
            <DashboardIcon icon={FilterIcon} size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8b85] dark:text-[#b8b8c0]" aria-hidden="true" />
            <select value={status} onChange={(event) => setStatus(event.target.value as "ALL" | CIRunStatus)} className="h-10 w-full appearance-none rounded-xl border border-[#e3e3dd] bg-[#fcfcfa] dark:bg-[#101016] pl-9 pr-3 text-[12px] font-medium text-[#4d4d47] dark:text-[#d3d3d5] outline-none transition-colors focus:border-[#8fb2fa]">
              {ciStatuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Filter CI runs by repository</span>
            <select value={repositoryId} onChange={(event) => setRepositoryId(event.target.value)} className="h-10 w-full rounded-xl border border-[#e3e3dd] bg-[#fcfcfa] dark:bg-[#101016] px-3 text-[12px] font-medium text-[#4d4d47] dark:text-[#d3d3d5] outline-none transition-colors focus:border-[#8fb2fa]">
              <option value="ALL">All repositories</option>
              {repositories.map((repository) => <option key={repository.id} value={repository.fullName}>{repository.fullName}</option>)}
            </select>
          </label>
          <label className="relative block">
            <span className="sr-only">Search current CI page</span>
            <DashboardIcon icon={Search01Icon} size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8b85] dark:text-[#b8b8c0]" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search repository, workflow, or run" className="h-10 w-full rounded-xl border border-[#e3e3dd] bg-[#fcfcfa] dark:bg-[#101016] pl-9 pr-3 text-[12px] font-medium text-[#4d4d47] dark:text-[#d3d3d5] outline-none placeholder:text-[#aaa9a3] dark:text-[#a9a9b1] transition-colors focus:border-[#8fb2fa]" />
          </label>
        </div>
        <p className="mt-3 text-[11px] text-[#92928c] dark:text-[#b8b8c0]">Filters apply to the runs on this page. Make sure the Merg GitHub App has &quot;Actions: Read-only&quot; permission so failures get triaged at all.</p>
      </section>

      {error ? <div className="rounded-2xl border border-[#f2d1d1] bg-[#fff6f6] px-4 py-3 text-[13px] text-[#a53d3d]">Showing your last loaded results. Refresh failed: {error}</div> : null}

      <section className="overflow-hidden rounded-2xl border border-[#e5e5e0] bg-white dark:border-white/10 dark:bg-[#14141a] shadow-[0_8px_24px_rgba(23,23,23,0.035)]">
        <div className="flex flex-col justify-between gap-2 border-b border-[#ecece7] px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.025em]">Workflow runs</h2>
            <p className="mt-1 text-[12px] text-[#83837d] dark:text-[#b8b8c0]">{pagination?.total ?? 0} total {pagination?.total === 1 ? "run" : "runs"} · newest first</p>
          </div>
          <p className="text-[12px] font-medium text-[#777771] dark:text-[#a1a1aa]">{filteredRuns.length} visible on this page</p>
        </div>

        {filteredRuns.length ? (
          <div className="divide-y divide-[#efefeb] dark:divide-white/10">
            {filteredRuns.map((run) => (
              <article key={run.id} className="grid gap-4 px-5 py-5 transition-colors hover:bg-[#fcfcfa] dark:bg-[#101016] dark:hover:bg-white/5 md:grid-cols-[minmax(0,1.3fr)_auto_auto] md:items-center md:px-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0f4ff] text-[#2764d8]"><DashboardIcon icon={WorkflowSquare02Icon} size={16} aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-[13px] font-semibold text-[#33332f] dark:text-[#e2e2e1]">{run.repository.fullName}</p>
                      <span className="text-[12px] text-[#8b8b85] dark:text-[#b8b8c0]">{run.workflowName}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <ClassificationBadge classification={run.classification} />
                      <p className="text-[12px] text-[#85857f] dark:text-[#9a9aa3]">Run #{run.workflowRunId} · {run.pullNumber ? `PR #${run.pullNumber}` : run.headSha.slice(0, 7)}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[12px] text-[#7d7d77] dark:text-[#b8b8c0] md:block md:text-right">
                  <p>Created {formatRelativeTime(run.createdAt)}</p>
                  <p className="mt-1">{run.postedCommentId ? `Posted ${formatDateTime(run.createdAt)}` : "Not posted yet"}</p>
                </div>
                <div className="flex items-center justify-between gap-3 md:justify-end">
                  <CiStatusBadge status={run.status} />
                  <div className="flex items-center gap-1">
                    <Link href={`/dashboard/ci/${run.id}`} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-[#2764d8] transition-colors hover:bg-[#edf3ff]">Details <DashboardIcon icon={ArrowUpRight01Icon} size={14} aria-hidden="true" /></Link>
                    <a href={githubWorkflowRunUrl(run.repository.fullName, run.workflowRunId)} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-[#74746f] dark:text-[#c2c2c9] transition-colors hover:bg-[#f1f1ed] hover:text-[#2764d8]" aria-label={`Open workflow run ${run.workflowRunId} on GitHub`}><DashboardIcon icon={ExternalLinkIcon} size={14} aria-hidden="true" /></a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <DashboardIcon icon={Search01Icon} size={20} className="mx-auto text-[#a3a39d] dark:text-[#a9a9b1]" aria-hidden="true" />
            <p className="mt-3 text-[13px] font-medium text-[#4d4d48] dark:text-[#d3d3d5]">No CI runs match these filters.</p>
            <button type="button" onClick={() => { setStatus("ALL"); setRepositoryId("ALL"); setSearch(""); }} className="mt-3 text-[12px] font-semibold text-[#2764d8] hover:text-[#174cae]">Clear filters</button>
          </div>
        )}
      </section>

      {pagination && pagination.pages > 1 ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-[12px] text-[#777771] dark:text-[#a1a1aa]">Page {pagination.page} of {pagination.pages}</p>
          <div className="flex gap-2">
            <button type="button" disabled={pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="inline-flex h-9 items-center gap-1 rounded-full border border-[#ddddD7] bg-white dark:border-white/10 dark:bg-[#14141a] px-3 text-[12px] font-semibold text-[#4b4b46] dark:text-[#d3d3d5] disabled:cursor-not-allowed disabled:opacity-45"><DashboardIcon icon={ArrowLeft01Icon} size={14} aria-hidden="true" />Previous</button>
            <button type="button" disabled={pagination.page >= pagination.pages} onClick={() => setPage((current) => current + 1)} className="inline-flex h-9 items-center gap-1 rounded-full border border-[#ddddD7] bg-white dark:border-white/10 dark:bg-[#14141a] px-3 text-[12px] font-semibold text-[#4b4b46] dark:text-[#d3d3d5] disabled:cursor-not-allowed disabled:opacity-45">Next<DashboardIcon icon={ArrowRight01Icon} size={14} aria-hidden="true" /></button>
          </div>
        </div>
      ) : null}
    </div>
  );
}