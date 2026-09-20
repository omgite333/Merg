"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen01Icon, ExternalLinkIcon, GitBranchIcon, Shield01Icon } from "@hugeicons/core-free-icons";
import { getDashboard } from "@/lib/api";
import type { DashboardResponse } from "@/types/dashboard";
import { DashboardIcon, DashboardLoading, EmptyPanel } from "./DashboardPrimitives";

export function SettingsScreen() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    try {
      const nextData = await getDashboard();
      setData(nextData);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load workspace settings.");
    } finally {
      setLoading(false);
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
          setError(loadError instanceof Error ? loadError.message : "Could not load workspace settings.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading && !data) {
    return <DashboardLoading label="Loading workspace settings" />;
  }

  if (error && !data) {
    return <EmptyPanel title="Settings are unavailable" description="Check that the Merg API is running, then try again." action={<button onClick={() => void loadDashboard()} type="button" className="rounded-full bg-[#20201e] px-4 py-2.5 text-[12px] font-semibold text-white">Try again</button>} />;
  }

  const installations = data?.installations ?? [];

  return (
    <div className="max-w-4xl space-y-7">
      <section>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#2764d8]">Workspace settings</p>
        <h1 className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.06em] text-[#20201e] dark:text-white sm:text-[38px]">Your Merg connection.</h1>
        <p className="mt-3 max-w-xl text-[14px] leading-6 text-[#73736e] dark:text-[#a1a1aa]">Manage GitHub App access and find the essentials for your review workspace.</p>
      </section>

      {error ? <div className="rounded-2xl border border-[#f2d1d1] bg-[#fff6f6] px-4 py-3 text-[13px] text-[#a53d3d]">Showing your last loaded settings. Refresh failed: {error}</div> : null}

      <section className="overflow-hidden rounded-2xl border border-[#e5e5e0] bg-white dark:border-white/10 dark:bg-[#14141a] shadow-[0_8px_24px_rgba(23,23,23,0.035)]">
        <div className="border-b border-[#ecece7] px-5 py-4 sm:px-6"><h2 className="text-[15px] font-semibold tracking-[-0.025em]">Connected GitHub accounts</h2><p className="mt-1 text-[12px] text-[#83837d] dark:text-[#b8b8c0]">Merg can only review repositories granted through a GitHub App installation.</p></div>
        {installations.length ? (
          <div className="divide-y divide-[#efefeb] dark:divide-white/10">
            {installations.map((installation) => (
              <div key={installation.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#edf3ff] text-[#2764d8]"><DashboardIcon icon={GitBranchIcon} size={19} aria-hidden="true" /></span><div><p className="text-[13px] font-semibold text-[#33332f] dark:text-[#e2e2e1]">{installation.githubAccountLogin}</p><p className="mt-1 text-[12px] text-[#85857f] dark:text-[#9a9aa3]">{installation.githubAccountType} account · {installation.repositories.length} reviewed {installation.repositories.length === 1 ? "repository" : "repositories"}</p></div></div>
                <a href="https://github.com/settings/installations" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 self-start rounded-full border border-[#ddddD7] bg-white dark:border-white/10 dark:bg-[#14141a] px-3.5 py-2 text-[12px] font-semibold text-[#4b4b46] dark:text-[#d3d3d5] transition-colors hover:border-[#bfbfb8] hover:bg-[#f7f7f4] dark:hover:bg-white/10 sm:self-auto">Manage on GitHub <DashboardIcon icon={ExternalLinkIcon} size={14} aria-hidden="true" /></a>
              </div>
            ))}
          </div>
        ) : <div className="px-6 py-12 text-center text-[13px] text-[#777771] dark:text-[#a1a1aa]">No GitHub App installations are connected yet.</div>}
      </section>

      <section className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#e5e5e0] bg-white dark:border-white/10 dark:bg-[#14141a] p-5 shadow-[0_8px_24px_rgba(23,23,23,0.035)]"><span className="grid size-10 place-items-center rounded-xl bg-[#edf9f1] text-[#198b4d]"><DashboardIcon icon={Shield01Icon} size={19} aria-hidden="true" /></span><h2 className="mt-5 text-[15px] font-semibold tracking-[-0.025em]">Repository access</h2><p className="mt-2 text-[13px] leading-6 text-[#74746f] dark:text-[#c2c2c9]">Repository selection and GitHub App permissions are managed securely in GitHub.</p><Link href="/dashboard/repositories" className="mt-5 inline-flex text-[12px] font-semibold text-[#2764d8] hover:text-[#174cae]">Manage repositories →</Link></div>
        <div className="rounded-2xl border border-[#e5e5e0] bg-white dark:border-white/10 dark:bg-[#14141a] p-5 shadow-[0_8px_24px_rgba(23,23,23,0.035)]"><span className="grid size-10 place-items-center rounded-xl bg-[#fff5e9] text-[#b65b07]"><DashboardIcon icon={BookOpen01Icon} size={19} aria-hidden="true" /></span><h2 className="mt-5 text-[15px] font-semibold tracking-[-0.025em]">Need help?</h2><p className="mt-2 text-[13px] leading-6 text-[#74746f] dark:text-[#c2c2c9]">Read the setup guide to understand how installations, webhooks, and automatic reviews work.</p><Link href="/docs" className="mt-5 inline-flex text-[12px] font-semibold text-[#2764d8] hover:text-[#174cae]">Open documentation →</Link></div>
      </section>
    </div>
  );
}