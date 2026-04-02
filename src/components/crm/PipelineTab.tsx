"use client";

import { useState, useEffect } from "react";
import { Building2, Target, Trophy, Percent, Clock, AlertCircle, Mail, Send, PackageCheck, Eye } from "lucide-react";
import {
  PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { useLocale } from "@/contexts/LocaleContext";

const STAGE_COLORS: Record<string, string> = {
  "Not Started": "#8a7f74",
  "Email Pitched": "#6366f1",
  Pitched: "#4a90d9",
  Meeting: "#e6b422",
  Negotiating: "#e67e22",
  Won: "#21c354",
  Lost: "#ff4b4b",
};

const STAGE_ORDER = [
  "Not Started",
  "Email Pitched",
  "Pitched",
  "Meeting",
  "Negotiating",
  "Won",
  "Lost",
];
const STAGE_LABELS: Record<string, string> = {
  "Not Started": "未开始",
  "Email Pitched": "Email Pitched",
  Pitched: "已发方案",
  Meeting: "已约见面",
  Negotiating: "谈判中",
  Won: "已签约",
  Lost: "终止",
};

/** 指标 Tab 顶部外联总览 KPI（总楼盘数、活跃交易等）；暂时隐藏，改为 true 即恢复 */
const SHOW_OVERVIEW_KPIS = false;

type EmailPitchStats = {
  emailSent: number;
  deliveryRate: number;
  openRate: number;
};

type Stats = {
  totalProperties: number;
  activeOutreach: number;
  needFollowUpCount?: number;
  wonCount: number;
  winRate: number;
  avgDays: number;
  statusCounts: Record<string, number>;
  weeks: { week: string; count: number }[];
  recent: { id: string; status: string; updated_at: string }[];
};

function OverviewKpiGrid({ stats }: { stats: Stats }) {
  const kpis = [
    { label: "总楼盘数", value: stats.totalProperties, icon: Building2 },
    { label: "活跃交易", value: stats.activeOutreach, icon: Target },
    { label: "需跟进", value: stats.needFollowUpCount ?? 0, icon: AlertCircle },
    { label: "Won", value: stats.wonCount, icon: Trophy },
    { label: "胜率", value: `${stats.winRate}%`, icon: Percent },
    { label: "平均成交天数", value: stats.avgDays, icon: Clock },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
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
  );
}

export function PipelineTab() {
  const { t, locale } = useLocale();
  const [stats, setStats] = useState<Stats | null>(null);
  const [emailPitch, setEmailPitch] = useState<EmailPitchStats | null>(null);
  const [emailPitchLoading, setEmailPitchLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crm/dashboard-stats")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setStats(d);
      })
      .finally(() => setLoading(false));

    fetch("/api/email/resend-property-status")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.pitchMetrics) {
          setEmailPitch(d.pitchMetrics);
        }
      })
      .catch(() => {})
      .finally(() => setEmailPitchLoading(false));
  }, []);

  if (loading) return <p className="py-12 text-center text-sm text-[#78716C]">加载中…</p>;
  if (!stats) return <p className="py-12 text-center text-sm text-[#78716C]">加载失败</p>;

  const funnelData = STAGE_ORDER.map((s) => ({
    name: STAGE_LABELS[s] ?? s,
    value: stats.statusCounts[s] ?? 0,
    fill: STAGE_COLORS[s] ?? "#8a7f74",
  }));
  const pieData = funnelData.filter((d) => d.value > 0);

  const pitch = emailPitch ?? { emailSent: 0, deliveryRate: 0, openRate: 0 };

  const emailKpis = [
    { labelKey: "crm.metricEmailSent" as const, value: pitch.emailSent, icon: Send },
    { labelKey: "crm.metricDeliveryRate" as const, value: `${pitch.deliveryRate}%`, icon: PackageCheck },
    { labelKey: "crm.metricOpenRate" as const, value: `${pitch.openRate}%`, icon: Eye },
  ];

  return (
    <div className="space-y-6">
      {SHOW_OVERVIEW_KPIS ? <OverviewKpiGrid stats={stats} /> : null}

      <div className="rounded-lg bg-white p-5 shadow-card">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-[#1C1917]">
          <Mail className="h-4 w-4 text-[#78716C]" />
          {t("crm.emailPitchPerformance")}
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {emailKpis.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.labelKey} className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-4">
                <div className="mb-1 flex items-center gap-1.5 text-xs text-[#78716C]">
                  <Icon className="h-3.5 w-3.5" />
                  {t(k.labelKey)}
                </div>
                <div className="text-2xl font-semibold tabular-nums text-[#1C1917]">{k.value}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-5 shadow-card">
          <h3 className="mb-3 text-sm font-medium text-[#1C1917]">状态分布</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {pieData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg bg-white p-5 shadow-card">
          <h3 className="mb-3 text-sm font-medium text-[#1C1917]">近 12 周新增外联趋势</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.weeks}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#1C1917" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
