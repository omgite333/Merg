"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight01Icon,
  GitBranchIcon,
  GitForkIcon,
  GitPullRequestIcon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { getDashboard } from "@/lib/api";
import { GITHUB_APP_INSTALL_URL } from "@/routes/apiRoute";
import type { DashboardResponse } from "@/types/dashboard";
import { DashboardIcon, DashboardLoading, EmptyPanel } from "./DashboardPrimitives";

export function RepositoriesScreen() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    try {
      const nextData = await getDashboard();
      setData(nextData);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load repositories.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    getDashboard()
      .then((nextData) => {
        if (!cancelled) {
          setData(nextData);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load repositories.");
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

  if (loading && !data) {
    return <DashboardLoading label="Loading connected repositories" />;
  }

  if (error && !data) {
    return (
      <EmptyPanel
        title="Repositories are unavailable"
        description="Check that the Merg API is running, then try again."
        action={<button onClick={() => void loadDashboard()} type="button" className="rounded-full bg-[#20201e] px-4 py-2.5 text-[12px] font-semibold text-white">Try again</button>}
      />
    );
  }

  const installations = data?.installations ?? [];

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#2764d8]">Repository controls</p>
          <h1 className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.06em] text-[#20201e] sm:text-[38px]">Choose where Merg reviews.</h1>
          <p className="mt-3 max-w-xl text-[14px] leading-6 text-[#73736e]">Add repositories through the GitHub App, then track the reviews they have received.</p>
        </div>
        <a href={GITHUB_APP_INSTALL_URL} target="_blank" rel="noreferrer" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[#20201e] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[#343430]">
          <DashboardIcon icon={GitBranchIcon} size={14} aria-hidden="true" />
          Add repositories
        </a>
      </section>

      {error ? <div className="rounded-2xl border border-[#f2d1d1] bg-[#fff6f6] px-4 py-3 text-[13px] text-[#a53d3d]">Showing your last loaded repositories. Refresh failed: {error}</div> : null}

      {installations.length ? (
        <div className="space-y-5">
          {installations.map((installation) => (
            <section key={installation.id} className="overflow-hidden rounded-2xl border border-[#e5e5e0] bg-white shadow-[0_8px_24px_rgba(23,23,23,0.035)]">
              <div className="flex flex-col gap-4 border-b border-[#ecece7] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#edf3ff] text-[#2764d8]"><DashboardIcon icon={GitBranchIcon} size={19} aria-hidden="true" /></span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-semibold tracking-[-0.025em] text-[#30302c]">{installation.githubAccountLogin}</h2>
                      <span className="rounded-full border border-[#c6ead4] bg-[#edf9f1] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#167541]">{installation.status.toLowerCase()}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-[#85857f]">{installation.githubAccountType} account · {installation.repositories.length} reviewed {installation.repositories.length === 1 ? "repository" : "repositories"}</p>
                  </div>
                </div>
                <button onClick={() => void loadDashboard(true)} type="button" disabled={refreshing} className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-full border border-[#ddddD7] bg-white px-3.5 text-[12px] font-semibold text-[#4b4b46] transition-colors hover:border-[#bfbfb8] hover:bg-[#f7f7f4] disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto">
                  <DashboardIcon icon={Refresh01Icon} size={14} className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
                  Refresh
                </button>
              </div>

              {installation.repositories.length ? (
                <div className="divide-y divide-[#efefeb]">
                  {installation.repositories.map((repository) => (
                    <article key={repository.id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-[#fcfcfa] sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div className="flex min-w-0 items-start gap-3">
                        <DashboardIcon icon={GitForkIcon} size={16} className="mt-0.5 shrink-0 text-[#70706b]" aria-hidden="true" />
                        <div className="min-w-0">
                          <a href={`https://github.com/${repository.fullName}`} target="_blank" rel="noreferrer" className="block truncate text-[13px] font-semibold text-[#33332f] hover:text-[#2764d8]">{repository.fullName}</a>
                          <p className="mt-1 text-[12px] text-[#85857f]">{repository.recentReviews.length} {repository.recentReviews.length === 1 ? "review" : "reviews"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 pl-6 sm:pl-0">
                        {repository.recentReviews.slice(0, 3).map((review) => (
                          <a key={review.id} href={`/dashboard/reviews/${review.id}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-[#2764d8] transition-colors hover:bg-[#edf3ff]">PR #{review.prNumber}</a>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-12 text-center">
                  <DashboardIcon icon={GitPullRequestIcon} size={20} className="mx-auto text-[#a3a39d]" aria-hidden="true" />
                  <p className="mt-3 text-[13px] font-medium text-[#4d4d48]">No reviews have run yet for this installation.</p>
                  <p className="mt-1 text-[12px] text-[#898983]">Open a pull request in a repository granted to the GitHub App.</p>
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <EmptyPanel
          title="No repositories are connected"
          description="Install the Merg GitHub App and select the repositories you want reviewed."
          action={<a href={GITHUB_APP_INSTALL_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#20201e] px-4 py-2.5 text-[12px] font-semibold text-white">Install on GitHub <DashboardIcon icon={ArrowUpRight01Icon} size={14} aria-hidden="true" /></a>}
        />
      )}
    </div>
  );
}