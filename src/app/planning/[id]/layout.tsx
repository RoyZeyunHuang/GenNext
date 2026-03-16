import Link from "next/link";
import { PlanningTabs } from "@/components/planning/PlanningTabs";

export default async function PlanningIdLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2 text-sm text-[#78716C]">
        <Link href="/planning" className="hover:text-[#1C1917]">内容排期</Link>
        <span>/</span>
        <span className="text-[#1C1917]" id="planning-breadcrumb-title">计划</span>
      </div>
      <PlanningTabs planId={id} />
      {children}
    </div>
  );
}
