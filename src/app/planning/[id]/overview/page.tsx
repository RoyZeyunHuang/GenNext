import { OverviewPageClient } from "@/components/planning/OverviewPageClient";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OverviewPageClient planId={id} />;
}
