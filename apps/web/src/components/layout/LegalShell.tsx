import type { ReactNode } from "react";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";

export function LegalShell({
  eyebrow,
  title,
  updatedAt,
  children,
}: {
  eyebrow: string;
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#171717] dark:bg-[#0c0c10] dark:text-[#ececeb]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[760px] flex-1 px-5 py-16 sm:px-8 sm:py-20">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#2764d8]">{eyebrow}</p>
        <h1 className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.06em] text-[#171717] dark:text-white sm:text-[44px]">{title}</h1>
        <p className="mt-4 text-[13px] text-[#8b8b85] dark:text-[#9a9aa3]">Last updated: {updatedAt}</p>
        <div className="mt-12 space-y-12">{children}</div>
      </main>
      <LandingFooter />
    </div>
  );
}