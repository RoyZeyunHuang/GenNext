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

type Row = {
  title: string;
  total_exposure: number;
  paid_exposure: number;
  natural_exposure: number;
  natural_ratio: number;
};
type ChangeMetric = { change: number; change_rate: number };
type NaturalCurrent = {
  natural_exposure: number;
  natural_interactions: number;
  natural_interaction_rate: number;
  natural_ratio: number;
};
type NaturalComparison = {
  start_date: string | null;
  end_date: string | null;
  current: NaturalCurrent | null;
  changes: {
    natural_exposure: ChangeMetric;
    natural_interactions: ChangeMetric;
    natural_interaction_rate: ChangeMetric;
    natural_ratio: ChangeMetric;
  } | null;
  trend: {
    date: string;
    natural_exposure: number;
    natural_interactions: number;
    natural_interaction_rate: number;
    natural_ratio: number;
  }[];
  no_comparison: boolean;
};

function KpiCard({
  label,
  value,
  change,
  vsDate,
  noComparison,
  isPercent = false,
}: {
  label: string;
  value: number;
  change?: ChangeMetric | null;
  vsDate?: string | null;
  noComparison?: boolean;
  isPercent?: boolean;
}) {
  const display = isPercent ? `${(value * 100).toFixed(2)}%` : value.toLocaleString();
  let changeNode: React.ReactNode = null;
  if (noComparison) {
    changeNode = <span className="text-xs text-[#A8A29E]">暂无对比数据</span>;
  } else if (change) {
    const v = isPercent
      ? `${change.change >= 0 ? "+" : ""}${(change.change * 100).toFixed(2)}%`
      : `${change.change >= 0 ? "+" : ""}${change.change.toLocaleString()}`;
    const r = `${change.change_rate >= 0 ? "+" : ""}${(change.change_rate * 100).toFixed(1)}%`;
    if (change.change > 0) {
      changeNode = <span className="text-xs text-emerald-600">↑ {v} ({r})</span>;
    } else if (change.change < 0) {
      changeNode = <span className="text-xs text-red-600">↓ {v} ({r})</span>;
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

export function NaturalTab({ filters }: { filters: KpiFilters }) {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<Row[]>([]);
  const [comparison, setComparison] = useState<NaturalComparison | null>(null);

  const fetchData = useCallback(async () => {
    if (!filters.from_date || !filters.to_date) return;
    setLoading(true);
    const params = new URLSearchParams({
      from_date: filters.from_date,
      to_date: filters.to_date,
    });
    const res = await fetch(`/api/kpi/natural-comparison?${params}`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    console.log("[NaturalTab] /api/kpi/natural-comparison 返回:", {
      ok: res.ok,
      listLen: data.list?.length,
      start: data.start_date,
      end: data.end_date,
      error: data.error,
    });
    if (data.error) {
      setList([]);
      setComparison(null);
    } else {
      setList(data.list ?? []);
      setComparison({
        start_date: data.start_date ?? null,
        end_date: data.end_date ?? null,
        current: data.current ?? null,
        changes: data.changes ?? null,
        trend: Array.isArray(data.trend) ? data.trend : [],
        no_comparison: !!data.no_comparison,
      });
    }
    setLoading(false);
  }, [filters.from_date, filters.to_date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && list.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-[#78716C]">
        加载中…
      </div>
    );
  }

  const rowBg = (ratio: number) => {
    if (ratio >= 0.7) return "bg-[#ECFDF5]"; // green
    if (ratio <= 0.3) return "bg-[#FEF2F2]"; // red
    return "";
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[#FEF3C7] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
        ⚠️ 自然流量为估算值，仅在两张表同日拉取时较准确
      </div>

      {comparison?.current && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard
            label="自然曝光总量"
            value={comparison.current.natural_exposure}
            change={comparison.changes?.natural_exposure}
            vsDate={comparison.start_date}
            noComparison={comparison.no_comparison}
          />
          <KpiCard
            label="自然互动总量"
            value={comparison.current.natural_interactions}
            change={comparison.changes?.natural_interactions}
            vsDate={comparison.start_date}
            noComparison={comparison.no_comparison}
          />
          <KpiCard
            label="自然平均互动率"
            value={comparison.current.natural_interaction_rate}
            isPercent
            change={comparison.changes?.natural_interaction_rate}
            vsDate={comparison.start_date}
            noComparison={comparison.no_comparison}
          />
          <KpiCard
            label="自然占全量比例"
            value={comparison.current.natural_ratio}
            isPercent
            change={comparison.changes?.natural_ratio}
            vsDate={comparison.start_date}
            noComparison={comparison.no_comparison}
          />
        </div>
      )}

      {comparison && (
        <>
          {comparison.trend.length <= 2 ? (
            <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] px-5 py-8 text-center text-sm text-[#78716C]">
              持续上传数据后可查看完整趋势
            </div>
          ) : (
            <div className="rounded-lg bg-white p-5 shadow-card">
              <h4 className="mb-4 text-sm font-medium text-[#1C1917]">
                自然流量趋势
              </h4>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={comparison.trend} margin={{ left: 20, right: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                    <XAxis dataKey="date" tick={{ fill: "#78716C", fontSize: 12 }} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fill: "#78716C", fontSize: 12 }}
                      tickFormatter={(v) =>
                        v >= 10000 ? `${(v / 10000).toFixed(0)}w` : String(v)
                      }
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
                        if (name.includes("率") || name.includes("比例")) {
                          return [`${(value * 100).toFixed(2)}%`, name];
                        }
                        return [value.toLocaleString(), name];
                      }}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="natural_exposure"
                      name="自然曝光"
                      stroke="#1C1917"
                      strokeWidth={2}
                      dot={{ fill: "#1C1917" }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="natural_interactions"
                      name="自然互动"
                      stroke="#78716C"
                      strokeWidth={2}
                      dot={{ fill: "#78716C" }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="natural_interaction_rate"
                      name="自然互动率"
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

      <div className="rounded-lg bg-white shadow-card overflow-hidden">
        <h4 className="border-b border-[#E7E5E4] bg-[#FAFAF9] px-4 py-3 text-sm font-medium text-[#1C1917]">
          投放笔记自然流量估算
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E4] bg-[#FAFAF9]">
                <th className="px-4 py-2 text-left font-medium text-[#1C1917]">
                  笔记标题
                </th>
                <th className="px-4 py-2 text-right font-medium text-[#78716C]">
                  总曝光
                </th>
                <th className="px-4 py-2 text-right font-medium text-[#78716C]">
                  投放曝光
                </th>
                <th className="px-4 py-2 text-right font-medium text-[#78716C]">
                  估算自然曝光
                </th>
                <th className="px-4 py-2 text-right font-medium text-[#78716C]">
                  自然占比
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr
                  key={i}
                  className={`border-b border-[#E7E5E4] hover:bg-[#FAFAF9] ${rowBg(r.natural_ratio)}`}
                >
                  <td className="px-4 py-2 text-left text-[#1C1917]">
                    <span className="line-clamp-2">{r.title}</span>
                  </td>
                  <td className="px-4 py-2 text-right text-[#78716C]">
                    {r.total_exposure.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-[#78716C]">
                    {r.paid_exposure.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-[#78716C]">
                    {r.natural_exposure.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    <span
                      className={
                        r.natural_ratio >= 0.7
                          ? "text-[#059669]"
                          : r.natural_ratio <= 0.3
                            ? "text-[#DC2626]"
                            : "text-[#78716C]"
                      }
                    >
                      {(r.natural_ratio * 100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && !loading && (
          <div className="py-12 text-center text-sm text-[#78716C]">
            暂无投放笔记或未关联投放数据
          </div>
        )}
      </div>
    </div>
  );
}
