"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function InstallationRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const setupAction = searchParams.get("setup_action");
    const installationId = searchParams.get("installation_id");

    if (setupAction || installationId) {
      const timer = setTimeout(() => {
        router.replace("/dashboard");
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [router, searchParams]);

  return null;
}