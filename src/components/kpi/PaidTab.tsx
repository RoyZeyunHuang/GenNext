"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { KpiFilters } from "./KpiClient";

type Kpi = {
  distinct_notes: number;
  total_spend: number;
  total_dm_lead: number;
  avg_acq_cost: number | null;
  total_impressions: number;
  avg_ctr: number | null;
  total_dm_in: number;
  total_dm_open: number;
  total_interactions: number;
  total_play_5s: number;
  play5s_rate: number | null;
};
type DailyPoint = { event_date: string; spend: number; dm_lead: number; video_plays: number };

function KpiCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-card">
      <div className="text-sm text-[#78716C]">{label}</div>
      <div className="mt-2 text-2xl font-bold text-[#1C1917]">{value}</div>
    </div>
  );
}

function formatInt(v: number | null | undefined): string {
  if (v == null) return "—";
  return Math.round(v).toLocaleString();
}

function formatCurrency(v: number | null | undefined): string {
  if (v == null) return "—";
  return "¥ " + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatCurrencyPer(v: number | null | undefined): string {
  if (v == null) return "—";
  return "¥ " + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPercent(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v * 100).toFixed(2) + "%";
}

export function PaidTab({ filters }: { filters: KpiFilters }) {
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [dailyTrend, setDailyTrend] = useState<DailyPoint[]>([]);

  const fetchData = useCallback(async () => {
    if (!filters.from_date || !filters.to_date) return;
    setLoading(true);
    const params = new URLSearchParams({
      from_date: filters.from_date,
      to_date: filters.to_date,
    });
    const res = await fetch(`/api/kpi/paid-stats?${params}`);
    const data = await res.json().catch(() => ({}));
    console.log("[PaidTab] /api/kpi/paid-stats 返回:", { ok: res.ok, kpi: data.kpi, trendLen: data.daily_trend?.length, error: data.error });
    if (data.error) {
      setKpi(null);
      setDailyTrend([]);
    } else {
      setKpi(data.kpi);
      setDailyTrend(data.daily_trend ?? []);
    }
    setLoading(false);
  }, [filters.from_date, filters.to_date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !kpi) {
    return (
      <div className="py-20 text-center text-sm text-[#78716C]">
        加载中…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {kpi && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard label="投放笔记数" value={formatInt(kpi.distinct_notes)} />
            <KpiCard label="总消费" value={formatCurrency(kpi.total_spend)} />
            <KpiCard label="总私信留资" value={formatInt(kpi.total_dm_lead)} />
            <KpiCard label="平均获客成本" value={formatCurrencyPer(kpi.avg_acq_cost)} />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard label="总展现量" value={formatInt(kpi.total_impressions)} />
            <KpiCard label="平均点击率" value={formatPercent(kpi.avg_ctr)} />
            <KpiCard label="总私信进线" value={formatInt(kpi.total_dm_in)} />
            <KpiCard label="总私信开口" value={formatInt(kpi.total_dm_open)} />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard label="总互动量" value={formatInt(kpi.total_interactions)} />
            <KpiCard label="总5s播放量" value={formatInt(kpi.total_play_5s)} />
            <KpiCard label="5s完播率" value={formatPercent(kpi.play5s_rate)} />
            <KpiCard label="点击率" value={formatPercent(kpi.avg_ctr)} />
          </div>
        </>
      )}

      {dailyTrend.length > 0 && (
        <div className="rounded-lg bg-white p-5 shadow-card">
          <h4 className="mb-4 text-sm font-medium text-[#1C1917]">
            每日投放趋势
          </h4>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend} margin={{ left: 20, right: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                <XAxis
                  dataKey="event_date"
                  tick={{ fill: "#78716C", fontSize: 12 }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "#78716C", fontSize: 12 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "#78716C", fontSize: 12 }}
                  tickFormatter={(v) => `¥${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FAFAF9",
                    border: "1px solid #E7E5E4",
                  }}
                  formatter={(value, name) => {
                    const v = Number(value ?? 0);
                    const n = String(name);
                    const labels: Record<string, string> = { spend: "消费", play_5s: "5s播放量" };
                    const display = n === "spend" ? `¥${v}` : v.toLocaleString();
                    return [display, labels[n] ?? n];
                  }}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="play_5s"
                  name="5s播放量"
                  stroke="#0EA5E9"
                  strokeWidth={2}
                  dot={{ fill: "#0EA5E9" }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="spend"
                  name="消费"
                  stroke="#1C1917"
                  strokeWidth={2}
                  dot={{ fill: "#1C1917" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
