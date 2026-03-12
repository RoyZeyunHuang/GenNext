import Link from "next/link";
import { BarChart3 } from "lucide-react";
import type { KpiEntry as KpiEntryType } from "@/types/dashboard";

function progressPercent(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((value / target) * 100));
}

export function KpiCard({ entries }: { entries: KpiEntryType[] }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[#1C1917]">
        <BarChart3 className="h-4 w-4 text-[#78716C]" />
        本周 KPI 进度
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-[#78716C]">
          暂无KPI数据，
          <Link href="/kpi" className="text-[#1C1917] underline hover:no-underline">
            前往KPI页面设置
          </Link>
        </p>
      ) : (
        <ul className="space-y-4">
          {entries.map((e) => {
            const pct = progressPercent(e.value, e.target);
            return (
              <li key={e.id}>
                <div className="flex justify-between text-sm">
                  <span className="text-[#1C1917]">{e.metric_name}</span>
                  <span className="text-[#78716C]">
                    {e.value} / {e.target}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#E7E5E4]">
                  <div
                    className="h-full rounded-full bg-[#1C1917] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
