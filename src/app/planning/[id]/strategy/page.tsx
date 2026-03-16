import { StrategyPageClient } from "@/components/planning/StrategyPageClient";

export default async function StrategyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StrategyPageClient planId={id} />;
}
