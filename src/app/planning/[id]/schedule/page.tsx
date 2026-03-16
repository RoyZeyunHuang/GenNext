import { SchedulePageClient } from "@/components/planning/SchedulePageClient";

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SchedulePageClient planId={id} />;
}
