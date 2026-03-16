import { PlanningClient } from "@/components/planning/PlanningClient";

export default function PlanningPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1917]">内容排期</h1>
        <p className="mt-1 text-sm text-[#78716C]">管理排期计划与内容日历</p>
      </div>
      <PlanningClient />
    </div>
  );
}
