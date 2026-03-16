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
  total_notes: number;
  total_exposure: number;
  total_views: number;
  total_interactions: number;
  total_follows: number;
  avg_interaction_rate: number;
  avg_collect_rate: number;
  avg_cover_ctr: number;
  follow_efficiency: number;
  paid_ratio: number;
};
type ChangeMetric = { change: number; change_rate: number };
type TrendPoint = { date: string; exposure: number; interactions: number; interaction_rate: number };
type NotesComparison = {
  start_date: string | null;
  end_date: string | null;
  current: Kpi | null;
  changes: Record<string, ChangeMetric> | null;
  trend: TrendPoint[];
  no_comparison: boolean;
};
type ByGenre = {
  video: { count: number; avg_interaction_rate: number; avg_collect_rate: number };
  image: { count: number; avg_interaction_rate: number; avg_collect_rate: number };
};
type TopRow = {
  rank: number;
  title: string;
  genre: string;
  exposure: number;
  interaction_rate: number;
  collect_rate: number;
  follows: number;
  is_paid: boolean;
};

function formatValue(value: number, isPercent = false): string {
  return isPercent ? `${(value * 100).toFixed(2)}%` : value.toLocaleString();
}

function KpiCardWithChange({
  label,
  value,
  change,
  isPercent = false,
  vsDate,
  noComparison,
}: {
  label: string;
  value: number;
  change?: ChangeMetric | null;
  isPercent?: boolean;
  vsDate?: string | null;
  noComparison?: boolean;
}) {
  const display = formatValue(value, isPercent);

  let changeNode: React.ReactNode = null;
  if (noComparison) {
    changeNode = <span className="text-xs text-[#A8A29E]">暂无对比数据</span>;
  } else if (change != null) {
    const changeValue = isPercent
      ? `${change.change >= 0 ? "+" : ""}${(change.change * 100).toFixed(2)}%`
      : `${change.change >= 0 ? "+" : ""}${change.change.toLocaleString()}`;
    const rateValue = `${change.change_rate >= 0 ? "+" : ""}${(change.change_rate * 100).toFixed(1)}%`;
    if (change.change > 0) {
      changeNode = (
        <span className="text-xs text-emerald-600">
          ↑ {changeValue} ({rateValue})
        </span>
      );
    } else if (change.change < 0) {
      changeNode = (
        <span className="text-xs text-red-600">
          ↓ {changeValue} ({rateValue})
        </span>
      );
    } else {
      changeNode = <span className="text-xs text-[#A8A29E]">—</span>;
    }
  }

  return (
    <div className="rounded-lg bg-white p-5 shadow-card">
      <div className="text-sm text-[#78716C]">{label}</div>
      <div className="mt-2 text-3xl font-bold text-[#1C1917]">{display}</div>
      {changeNode && <div className="mt-1">{changeNode}</div>}
      {vsDate && !noComparison && (
        <div className="mt-0.5 text-[10px] text-[#A8A29E]">vs {vsDate}</div>
      )}
    </div>
  );
}

export function NotesTab({
  filters,
  refreshToken = 0,
}: {
  filters: KpiFilters;
  refreshToken?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [comparison, setComparison] = useState<NotesComparison | null>(null);
  const [byGenre, setByGenre] = useState<ByGenre | null>(null);
  const [top10, setTop10] = useState<TopRow[]>([]);

  const fetchData = useCallback(async () => {
    if (!filters.from_date || !filters.to_date) return;
    setLoading(true);
    const comparisonParams = new URLSearchParams({
      from_date: filters.from_date,
      to_date: filters.to_date,
    });
    (filters.account_names ?? []).forEach((name) => comparisonParams.append("account", name));
    const comparisonRes = await fetch(
      `/api/kpi/notes-comparison?${comparisonParams}`,
      { cache: "no-store" }
    );
    const comparisonData = await comparisonRes.json().catch(() => ({}));
    if (!comparisonRes.ok || comparisonData.error) {
      setComparison(null);
      setByGenre(null);
      setTop10([]);
      setLoading(false);
      return;
    }
    setComparison({
      start_date: comparisonData.start_date ?? null,
      end_date: comparisonData.end_date ?? null,
      current: comparisonData.current ?? null,
      changes: comparisonData.changes ?? null,
      trend: Array.isArray(comparisonData.trend) ? comparisonData.trend : [],
      no_comparison: !!comparisonData.no_comparison,
    });

    if (!comparisonData.end_date) {
      setByGenre(null);
      setTop10([]);
      setLoading(false);
      return;
    }

    const statsParams = new URLSearchParams({
      snapshot_date: comparisonData.end_date,
      from_date: filters.from_date,
      to_date: filters.to_date,
    });
    (filters.account_names ?? []).forEach((name) => statsParams.append("account", name));
    const statsRes = await fetch(`/api/kpi/notes-stats?${statsParams}`, {
      cache: "no-store",
    });
    const statsData = await statsRes.json().catch(() => ({}));
    if (!statsRes.ok || statsData.error) {
      setByGenre(null);
      setTop10([]);
    } else {
      setByGenre(statsData.by_genre ?? null);
      setTop10(statsData.top10 ?? []);
    }
    setLoading(false);
  }, [filters.from_date, filters.to_date, filters.account_names, refreshToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !comparison) {
    return (
      <div className="py-20 text-center text-sm text-[#78716C]">
        加载中…
      </div>
    );
  }

  const kpi = comparison?.current;
  const hasNoData = !kpi || kpi.total_notes === 0;

  return (
    <div className="space-y-6">
      {hasNoData && (
        <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] px-5 py-8 text-center text-sm text-[#78716C]">
          <p className="font-medium text-[#1C1917]">暂无笔记数据</p>
          <p className="mt-1">请先在上方点击「上传」并选择「笔记列表明细」Excel 导入后，再查看本页。</p>
        </div>
      )}
      {kpi && comparison && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCardWithChange
              label="笔记总数"
              value={kpi.total_notes}
              change={comparison.changes?.total_notes}
              vsDate={comparison.start_date}
              noComparison={comparison.no_comparison}
            />
            <KpiCardWithChange
              label="总曝光"
              value={kpi.total_exposure}
              change={comparison.changes?.total_exposure}
              vsDate={comparison.start_date}
              noComparison={comparison.no_comparison}
            />
            <KpiCardWithChange
              label="总互动"
              value={kpi.total_interactions}
              change={comparison.changes?.total_interactions}
              vsDate={comparison.start_date}
              noComparison={comparison.no_comparison}
            />
            <KpiCardWithChange
              label="平均互动率"
              value={kpi.avg_interaction_rate}
              isPercent
              change={comparison.changes?.avg_interaction_rate}
              vsDate={comparison.start_date}
              noComparison={comparison.no_comparison}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCardWithChange
              label="总涨粉"
              value={kpi.total_follows}
              change={comparison.changes?.total_follows}
              vsDate={comparison.start_date}
              noComparison={comparison.no_comparison}
            />
            <KpiCardWithChange
              label="平均收藏率"
              value={kpi.avg_collect_rate}
              isPercent
              change={comparison.changes?.avg_collect_rate}
              vsDate={comparison.start_date}
              noComparison={comparison.no_comparison}
            />
            <KpiCardWithChange
              label="平均封面点击率"
              value={kpi.avg_cover_ctr}
              isPercent
              change={comparison.changes?.avg_cover_ctr}
              vsDate={comparison.start_date}
              noComparison={comparison.no_comparison}
            />
            <KpiCardWithChange
              label="涨粉效率"
              value={kpi.follow_efficiency}
              isPercent
              change={comparison.changes?.follow_efficiency}
              vsDate={comparison.start_date}
              noComparison={comparison.no_comparison}
            />
          </div>

          {comparison.trend.length <= 2 ? (
            <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] px-5 py-8 text-center text-sm text-[#78716C]">
              持续上传数据后可查看完整趋势
            </div>
          ) : (
            <div className="rounded-lg bg-white p-5 shadow-card">
              <h4 className="mb-4 text-sm font-medium text-[#1C1917]">趋势</h4>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={comparison.trend} margin={{ left: 20, right: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#78716C", fontSize: 12 }}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fill: "#78716C", fontSize: 12 }}
                      tickFormatter={(v) => (v >= 10000 ? `${(v / 10000).toFixed(0)}w` : String(v))}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fill: "#78716C", fontSize: 12 }}
                      tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#FAFAF9",
                        border: "1px solid #E7E5E4",
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === "平均互动率") return [(value * 100).toFixed(2) + "%", name];
                        return [value.toLocaleString(), name];
                      }}
                      labelFormatter={(label) => `日期: ${label}`}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="exposure"
                      name="总曝光"
                      stroke="#1C1917"
                      strokeWidth={2}
                      dot={{ fill: "#1C1917" }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="interactions"
                      name="总互动"
                      stroke="#78716C"
                      strokeWidth={2}
                      dot={{ fill: "#78716C" }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="interaction_rate"
                      name="平均互动率"
                      stroke="#0EA5E9"
                      strokeWidth={2}
                      dot={{ fill: "#0EA5E9" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {byGenre && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-white p-5 shadow-card">
            <h4 className="mb-3 text-sm font-medium text-[#1C1917]">视频</h4>
            <div className="text-2xl font-bold text-[#1C1917]">
              {byGenre.video.count} 篇
            </div>
            <div className="mt-2 text-sm text-[#78716C]">
              平均互动率{" "}
              {(byGenre.video.avg_interaction_rate * 100).toFixed(2)}% ·
              平均收藏率{" "}
              {(byGenre.video.avg_collect_rate * 100).toFixed(2)}%
            </div>
          </div>
          <div className="rounded-lg bg-white p-5 shadow-card">
            <h4 className="mb-3 text-sm font-medium text-[#1C1917]">图文</h4>
            <div className="text-2xl font-bold text-[#1C1917]">
              {byGenre.image.count} 篇
            </div>
            <div className="mt-2 text-sm text-[#78716C]">
              平均互动率{" "}
              {(byGenre.image.avg_interaction_rate * 100).toFixed(2)}% ·
              平均收藏率{" "}
              {(byGenre.image.avg_collect_rate * 100).toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-white shadow-card overflow-hidden">
        <h4 className="border-b border-[#E7E5E4] bg-[#FAFAF9] px-4 py-3 text-sm font-medium text-[#1C1917]">
          Top 10 笔记（按互动率降序）
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E4] bg-[#FAFAF9]">
                <th className="px-4 py-2 text-left font-medium text-[#1C1917]">
                  排名
                </th>
                <th className="px-4 py-2 text-left font-medium text-[#1C1917]">
                  标题
                </th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">
                  体裁
                </th>
                <th className="px-4 py-2 text-right font-medium text-[#78716C]">
                  曝光
                </th>
                <th className="px-4 py-2 text-right font-medium text-[#78716C]">
                  互动率
                </th>
                <th className="px-4 py-2 text-right font-medium text-[#78716C]">
                  收藏率
                </th>
                <th className="px-4 py-2 text-right font-medium text-[#78716C]">
                  涨粉
                </th>
              </tr>
            </thead>
            <tbody>
              {top10.map((r) => (
                <tr
                  key={r.rank}
                  className="border-b border-[#E7E5E4] hover:bg-[#FAFAF9]"
                >
                  <td className="px-4 py-2 text-left text-[#1C1917]">
                    {r.rank}
                  </td>
                  <td className="px-4 py-2 text-left text-[#1C1917]">
                    <span className="line-clamp-2">{r.title}</span>
                    {r.is_paid && (
                      <span className="ml-1.5 rounded bg-[#1C1917] px-1.5 py-0.5 text-[10px] text-white">
                        投放
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-left text-[#78716C]">
                    {r.genre || "-"}
                  </td>
                  <td className="px-4 py-2 text-right text-[#78716C]">
                    {r.exposure.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-[#78716C]">
                    {(r.interaction_rate * 100).toFixed(2)}%
                  </td>
                  <td className="px-4 py-2 text-right text-[#78716C]">
                    {(r.collect_rate * 100).toFixed(2)}%
                  </td>
                  <td className="px-4 py-2 text-right text-[#78716C]">
                    {r.follows.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {top10.length === 0 && !loading && (
          <div className="py-12 text-center text-sm text-[#78716C]">
            暂无数据
          </div>
        )}
      </div>
    </div>
  );
}
