import { KpiClient } from "@/components/kpi/KpiClient";

export default function KpiPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1917]">XHS KPI 系统</h1>
        <p className="mt-1 text-sm text-[#78716C]">KPI 分析、Bonus 核算、AI 评估、Campaign 报告与数据上传</p>
      </div>
      <KpiClient />
    </div>
  );
}
