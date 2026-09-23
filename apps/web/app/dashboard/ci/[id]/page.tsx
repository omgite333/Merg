import { CIRunDetailScreen } from "@/components/dashboard/CIRunDetailScreen";

export default async function CIRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CIRunDetailScreen ciRunId={id} />;
}