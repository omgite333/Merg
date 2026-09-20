import Image from "next/image";
import Link from "next/link";
import { GITHUB_APP_INSTALL_URL } from "@/routes/apiRoute";

const footerLinks = [
  { label: "GitHub", href: "https://github.com/omgite333/Merg" },
  { label: "Docs", href: "/docs" },
  { label: "Install", href: GITHUB_APP_INSTALL_URL },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-[#e9e9e6] bg-white dark:border-white/10 dark:bg-[#0c0c10]">
      <div className="flex flex-col gap-8 px-5 py-10 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-7 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.02em] text-[#171717] dark:text-white">
              <Image src="/companies/openmerge.png" alt="" width={32} height={32} className="size-8 rounded-[10px] object-cover" />
              Merg
            </Link>
            <p className="mt-3 max-w-[250px] text-[13px] leading-6 text-[#777] dark:text-[#8f8f97]">Clearer pull request reviews for teams that ship.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-[13px] text-[#696969] dark:text-[#8f8f97]" aria-label="Footer navigation">
            {footerLinks.map((link) => <a key={link.label} href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined} className="transition-colors hover:text-[#171717] dark:hover:text-white">{link.label}</a>)}
            <Link href="/privacy" className="transition-colors hover:text-[#171717] dark:hover:text-white">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-[#171717] dark:hover:text-white">Terms</Link>
          </nav>
        </div>
        <div className="flex flex-col gap-2 border-t border-[#eeeeeb] pt-5 text-[12px] text-[#969696] dark:border-white/10 dark:text-[#76767e] sm:flex-row sm:items-center sm:justify-between">
          <p>Open source, built in public.</p>
          <p>© {new Date().getFullYear()} Merg</p>
        </div>
      </div>
    </footer>
  );
}
