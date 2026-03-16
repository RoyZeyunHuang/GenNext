import { redirect } from "next/navigation";

export default async function PlanningIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/planning/${id}/schedule`);
}
