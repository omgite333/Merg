"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { DASHBOARD_URL, GITHUB_APP_INSTALL_URL } from "@/routes/apiRoute";

export function InstallButton({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();

  const handleClick = async () => {
    try {
      const response = await fetch(DASHBOARD_URL);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.installations?.length > 0) {
          router.push("/dashboard");
          return;
        }
      }
    } catch {
      // API unreachable — fall through to the install page
    }
    window.location.assign(GITHUB_APP_INSTALL_URL);
  };

  return (
    <button type="button" onClick={() => void handleClick()} className={className}>
      {children}
    </button>
  );
}