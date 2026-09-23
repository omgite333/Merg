import type { ReactNode } from "react";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? verifySession(token) : null;

  if (!session) {
    redirect("/api/auth/github/login");
  }

  return (
    <Suspense fallback={null}>
      <DashboardShell session={session}>{children}</DashboardShell>
    </Suspense>
  );
}