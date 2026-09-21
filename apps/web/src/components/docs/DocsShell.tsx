import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { cn } from "@/lib/utils";

const navigation = [
  {
    section: "Guide",
    items: [
      { label: "Overview", href: "#overview" },
      { label: "How it works", href: "#how-it-works" },
      { label: "The review agents", href: "#agents" },
      { label: "The dashboard", href: "#dashboard" },
      { label: "Configuration", href: "#configuration" },
    ],
  },
  {
    section: "Reference",
    items: [
      { label: "API endpoints", href: "#api" },
      { label: "Project information", href: "#project" },
    ],
  },
];

export function DocsShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#171717] dark:bg-[#0c0c10] dark:text-[#ececeb]">
      <SiteHeader />

      <div className="mx-auto flex w-full max-w-[1180px] flex-1 px-5 sm:px-8 lg:px-10">
        <aside className="sticky top-24 hidden h-[calc(100vh-6rem)] w-[220px] shrink-0 self-start overflow-y-auto border-r border-[#e9e9e6] py-10 pr-6 dark:border-white/10 lg:block">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9b9b94] dark:text-[#7c7c86]">Docs</p>
          <nav className="mt-5 space-y-6 text-[13px]">
            {navigation.map((group) => (
              <div key={group.section}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#ababa5] dark:text-[#6f6f7a]">{group.section}</p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className={cn("block rounded-lg px-2 py-1.5 transition-colors hover:text-[#171717] dark:hover:text-white")}>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-0 py-12 sm:px-8 lg:px-14">{children}</main>
      </div>

      <LandingFooter />
    </div>
  );
}