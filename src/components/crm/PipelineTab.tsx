"use client";

import { useState, useEffect } from "react";
import { Building2, Target, Trophy, Percent, Clock } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  "Not Started": "#8a7f74",
  "Contacted": "#4a90d9",
  "Meeting Scheduled": "#e6b422",
  "Proposal Sent": "#e67e22",
  "Won": "#21c354",
  "Lost": "#ff4b4b",
};

const STATUS_ORDER = ["Not Started", "Contacted", "Meeting Scheduled", "Proposal Sent", "Won", "Lost"];

type Stats = {
  totalProperties: number;
  activeOutreach: number;
  wonCount: number;
  winRate: number;
  avgDays: number;
  statusCounts: Record<string, number>;
  weeks: { week: string; count: number }[];
  recent: { id: string; status: string; updated_at: string }[];
};

export function PipelineTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crm/dashboard-stats")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setStats(d); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-12 text-center text-sm text-[#78716C]">加载中…</p>;
  if (!stats) return <p className="py-12 text-center text-sm text-[#78716C]">加载失败</p>;

  const funnelData = STATUS_ORDER.map((s) => ({ name: s, value: stats.statusCounts[s] ?? 0, fill: STATUS_COLORS[s] }));
  const pieData = funnelData.filter((d) => d.value > 0);

  const kpis = [
    { label: "总楼盘数", value: stats.totalProperties, icon: Building2 },
    { label: "活跃外联", value: stats.activeOutreach, icon: Target },
    { label: "Won", value: stats.wonCount, icon: Trophy },
    { label: "胜率", value: `${stats.winRate}%`, icon: Percent },
    { label: "平均成交天数", value: stats.avgDays, icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-5">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-lg bg-white p-4 shadow-card">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-[#78716C]">
                <Icon className="h-3.5 w-3.5" /> {k.label}
              </div>
              <div className="text-xl font-semibold text-[#1C1917]">{k.value}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-5 shadow-card">
          <h3 className="mb-3 text-sm font-medium text-[#1C1917]">Pipeline 漏斗</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnelData} layout="vertical" margin={{ left: 100 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={95} />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {funnelData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg bg-white p-5 shadow-card">
          <h3 className="mb-3 text-sm font-medium text-[#1C1917]">状态分布</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} label={({ name, value }) => `${name}: ${value}`}>
                {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-5 shadow-card">
          <h3 className="mb-3 text-sm font-medium text-[#1C1917]">近 12 周新增外联趋势</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.weeks}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#1C1917" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg bg-white p-5 shadow-card">
          <h3 className="mb-3 text-sm font-medium text-[#1C1917]">最近动态</h3>
          <div className="max-h-[200px] space-y-2 overflow-y-auto">
            {stats.recent.length === 0 ? (
              <p className="text-xs text-[#78716C]">暂无动态</p>
            ) : (
              stats.recent.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded border border-[#E7E5E4] bg-[#FAFAF9] px-2 py-1.5 text-xs">
                  <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[r.status] ?? "#8a7f74" }} />
                  <span className="text-[#1C1917]">{r.status}</span>
                  <span className="ml-auto text-[#A8A29E]">{new Date(r.updated_at).toLocaleDateString("zh-CN")}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
