import Image from "next/image";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { InstallButton } from "./InstallButton";

export function SiteHeader() {
  return (
    <header className="border-b border-[#ecece8] bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#0c0c10]/90">
      <div className="mx-auto flex h-[76px] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Merg home">
          <Image src="/companies/openmerge.png" alt="" width={36} height={36} className="size-9 rounded-[11px] object-cover" priority />
          <span className="text-[17px] font-semibold tracking-[-0.04em] text-[#171717] dark:text-white">Merg</span>
        </Link>
        <InstallButton className="group inline-flex items-center gap-2 rounded-full bg-[#171717] px-4 py-2.5 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-[#2a2a2a] dark:bg-white dark:text-[#111110] dark:hover:bg-[#e5e5e2]">
          Get started
          <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} strokeWidth={1.8} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </InstallButton>
      </div>
    </header>
  );
}