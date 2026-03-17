"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Phone, ChevronRight, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const STAGE_ORDER = ["Not Started", "Pitched", "Meeting", "Negotiating", "Won", "Lost"];
const STAGE_LABELS: Record<string, string> = {
  "Not Started": "未开始",
  Pitched: "已发方案",
  Meeting: "已约见面",
  Negotiating: "谈判中",
  Won: "已签约",
  Lost: "终止",
};
const STAGE_COLORS: Record<string, string> = {
  "Not Started": "#a8a29e",
  Pitched: "#94a3b8",
  Meeting: "#fcd34d",
  Negotiating: "#fdba74",
  Won: "#86efac",
  Lost: "#fca5a5",
};

export function BrmSummaryCard() {
  const [stats, setStats] = useState<{
    activeOutreach?: number;
    winRate?: number;
    statusCounts?: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    fetch("/api/crm/dashboard-stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.error)
          setStats({
            activeOutreach: d.activeOutreach ?? 0,
            winRate: d.winRate ?? 0,
            statusCounts: d.statusCounts ?? {},
          });
      })
      .catch(() => {});
  }, []);

  const statusCounts = stats?.statusCounts ?? {};
  const pieData = stats
    ? STAGE_ORDER.map((s) => ({ name: s, value: statusCounts[s] ?? 0 })).filter((d) => d.value > 0)
    : [];

  return (
    <Link
      href="/crm?tab=outreach"
      className="block rounded-lg bg-white p-5 shadow-card transition-colors hover:bg-[#FAFAF9]"
    >
      <div className="flex items-stretch gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#1C1917]">
            <Phone className="h-4 w-4 text-[#78716C]" />
            Business Relationship Management
          </div>
          {stats ? (
            <div className="mt-2 flex gap-4 text-sm">
              <span className="text-[#1C1917]">
                <span className="text-[#78716C]">活跃交易</span>{" "}
                <span className="font-semibold">{stats.activeOutreach ?? 0}</span>
              </span>
              <span className="text-[#1C1917]">
                <span className="text-[#78716C]">胜率</span>{" "}
                <span className="font-semibold">{stats.winRate ?? 0}%</span>
              </span>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-1 text-xs text-[#78716C]">
              <Loader2 className="h-3 w-3 animate-spin" />
              加载中…
            </div>
          )}
          <span className="mt-3 inline-flex items-center gap-0.5 text-xs font-medium text-[#1C1917]">
            进入追踪
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pieData && pieData.length > 0 ? (
            <>
              <ul className="flex flex-col gap-0.5 text-[10px] text-[#78716C]">
                {pieData.map((entry) => (
                  <li key={entry.name} className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: STAGE_COLORS[entry.name] ?? "#a8a29e" }}
                    />
                    <span className="truncate">{STAGE_LABELS[entry.name] ?? entry.name}</span>
                  </li>
                ))}
              </ul>
              <ResponsiveContainer width={72} height={72}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={20}
                    outerRadius={34}
                    paddingAngle={1}
                    dataKey="value"
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={STAGE_COLORS[entry.name] ?? "#a8a29e"} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
