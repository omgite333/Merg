"use client";

import type { ReactNode } from "react";
import { GITHUB_APP_INSTALL_URL } from "@/routes/apiRoute";

export function InstallButton({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <button type="button" onClick={() => window.location.assign(GITHUB_APP_INSTALL_URL)} className={className}>
      {children}
    </button>
  );
}