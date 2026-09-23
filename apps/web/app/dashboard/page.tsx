import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { CIOverview } from "@/components/dashboard/CIOverview";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;

  if (mode === "ci") {
    return <CIOverview />;
  }

  return <DashboardOverview />;
}