"use client";

import type { ReactNode } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import type {
  ByGenre,
  ChangeMetric,
  NotesComparison,
  TopRow,
} from "@/lib/kpiNotesReportData";

export type CampaignReportPdfMeta = {
  title: string;
  summary: string | null;
  date_from: string;
  date_to: string;
};

const CHART_W = 722;
const CHART_H = 280;

function formatValue(
  value: number,
  isPercent = false,
  unit: "none" | "seconds" = "none"
): string {
  if (unit === "seconds") return `${value.toFixed(1)} 秒`;
  return isPercent ? `${(value * 100).toFixed(2)}%` : value.toLocaleString();
}

function PdfKpiCard({
  label,
  value,
  change,
  isPercent = false,
  valueUnit = "none",
  vsDate,
  noComparison,
}: {
  label: string;
  value: number;
  change?: ChangeMetric | null;
  isPercent?: boolean;
  valueUnit?: "none" | "seconds";
  vsDate?: string | null;
  noComparison?: boolean;
}) {
  const display = formatValue(value, isPercent, valueUnit);

  let changeNode: ReactNode = null;
  if (noComparison) {
    changeNode = (
      <span className="text-[11px] text-[#A8A29E]">暂无对比数据</span>
    );
  } else if (change != null) {
    const changeValue =
      valueUnit === "seconds"
        ? `${change.change >= 0 ? "+" : ""}${change.change.toFixed(1)} 秒`
        : isPercent
          ? `${change.change >= 0 ? "+" : ""}${(change.change * 100).toFixed(2)}%`
          : `${change.change >= 0 ? "+" : ""}${change.change.toLocaleString()}`;
    const rateValue = `${change.change_rate >= 0 ? "+" : ""}${(change.change_rate * 100).toFixed(1)}%`;
    if (change.change > 0) {
      changeNode = (
        <span className="text-[11px]" style={{ color: "#28a745" }}>
          ↑ {changeValue} ({rateValue})
        </span>
      );
    } else if (change.change < 0) {
      changeNode = (
        <span className="text-[11px]" style={{ color: "#dc3545" }}>
          ↓ {changeValue} ({rateValue})
        </span>
      );
    } else {
      changeNode = <span className="text-[11px] text-[#A8A29E]">—</span>;
    }
  }

  return (
    <div className="rounded-lg border border-[#E7E5E4] bg-white p-4 shadow-sm">
      <div className="text-[13px] text-[#78716C]">{label}</div>
      <div className="mt-1.5 text-[26px] font-bold leading-tight text-[#1C1917]">
        {display}
      </div>
      {changeNode && <div className="mt-1">{changeNode}</div>}
      {vsDate && !noComparison && (
        <div className="mt-1 text-[10px] text-[#A8A29E]">vs {vsDate}</div>
      )}
    </div>
  );
}

/**
 * 固定 794px 宽的「打印页」布局，专供 html2canvas → PDF，避免仪表盘上的 overflow/裁剪。
 */
export function CampaignReportPdfDocument({
  report,
  comparison,
  byGenre,
  top10,
}: {
  report: CampaignReportPdfMeta;
  comparison: NotesComparison;
  byGenre: ByGenre | null;
  top10: TopRow[];
}) {
  const kpi = comparison.current;

  if (!kpi) {
    return (
      <div
        className="box-border bg-white text-[#1C1917]"
        style={{ width: 794, padding: 40, fontFamily: "system-ui, sans-serif" }}
      >
        <p className="text-sm text-[#78716C]">暂无笔记数据</p>
      </div>
    );
  }

  /* PDF 固定 794px 宽，始终 4 列，避免断点未命中 */
  const gridClass = "grid grid-cols-4 gap-3";

  return (
    <div
      className="campaign-report-pdf-root box-border overflow-visible bg-white text-[#1C1917]"
      style={{
        width: 794,
        padding: "36px 36px 40px",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <header className="mb-6">
        <h1 className="m-0 text-[22px] font-bold tracking-tight text-[#1C1917]">
          {report.title}
        </h1>
        {report.summary && (
          <p className="mt-2.5 text-[13px] leading-relaxed text-[#78716C]">
            {report.summary}
          </p>
        )}
        <p className="mt-2.5 text-[12px] text-[#A8A29E]">
          以下数据与 KPI「全量笔记」一致（日期范围：{report.date_from} →{" "}
          {report.date_to}）
        </p>
      </header>

      <div className={`${gridClass} mb-3`}>
        <PdfKpiCard
          label="笔记总数"
          value={kpi.total_notes}
          change={comparison.changes?.total_notes}
          vsDate={comparison.start_date}
          noComparison={comparison.no_comparison}
        />
        <PdfKpiCard
          label="总曝光"
          value={kpi.total_exposure}
          change={comparison.changes?.total_exposure}
          vsDate={comparison.start_date}
          noComparison={comparison.no_comparison}
        />
        <PdfKpiCard
          label="总互动"
          value={kpi.total_interactions}
          change={comparison.changes?.total_interactions}
          vsDate={comparison.start_date}
          noComparison={comparison.no_comparison}
        />
        <PdfKpiCard
          label="平均互动率"
          value={kpi.avg_interaction_rate}
          isPercent
          change={comparison.changes?.avg_interaction_rate}
          vsDate={comparison.start_date}
          noComparison={comparison.no_comparison}
        />
      </div>

      <div className={`${gridClass} mb-8`}>
        <PdfKpiCard
          label="总涨粉"
          value={kpi.total_follows}
          change={comparison.changes?.total_follows}
          vsDate={comparison.start_date}
          noComparison={comparison.no_comparison}
        />
        <PdfKpiCard
          label="观看量"
          value={kpi.total_views}
          change={comparison.changes?.total_views}
          vsDate={comparison.start_date}
          noComparison={comparison.no_comparison}
        />
        <PdfKpiCard
          label="平均封面点击率"
          value={kpi.avg_cover_ctr}
          isPercent
          change={comparison.changes?.avg_cover_ctr}
          vsDate={comparison.start_date}
          noComparison={comparison.no_comparison}
        />
        <PdfKpiCard
          label="人均观看时长"
          value={kpi.avg_watch_time}
          valueUnit="seconds"
          change={comparison.changes?.avg_watch_time}
          vsDate={comparison.start_date}
          noComparison={comparison.no_comparison}
        />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-[14px] font-semibold text-[#1C1917]">趋势</h2>
        {comparison.trend.length <= 2 ? (
          <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] px-4 py-6 text-center text-[13px] text-[#78716C]">
            持续上传数据后可查看完整趋势
          </div>
        ) : (
          <div
            className="rounded-lg border border-[#E7E5E4] bg-white p-4"
            style={{ width: CHART_W + 32 }}
          >
            <LineChart
              width={CHART_W}
              height={CHART_H}
              data={comparison.trend}
              margin={{ left: 4, right: 44, top: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#78716C", fontSize: 11 }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: "#78716C", fontSize: 11 }}
                tickFormatter={(v) =>
                  v >= 10000 ? `${(v / 10000).toFixed(0)}w` : String(v)
                }
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: "#78716C", fontSize: 11 }}
                tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="exposure"
                name="总曝光"
                stroke="#1C1917"
                strokeWidth={2}
                dot={{ fill: "#1C1917", r: 3 }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="interactions"
                name="总互动"
                stroke="#78716C"
                strokeWidth={2}
                dot={{ fill: "#78716C", r: 3 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="interaction_rate"
                name="平均互动率"
                stroke="#0EA5E9"
                strokeWidth={2}
                dot={{ fill: "#0EA5E9", r: 3 }}
              />
            </LineChart>
          </div>
        )}
      </section>

      {byGenre && (
        <div className="mb-8 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-[#E7E5E4] bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[13px] font-medium text-[#1C1917]">视频</h3>
            <div className="text-[22px] font-bold text-[#1C1917]">
              {byGenre.video.count} 篇
            </div>
            <p className="mt-2 text-[12px] text-[#78716C]">
              平均互动率 {(byGenre.video.avg_interaction_rate * 100).toFixed(2)}
              % · 平均收藏率{" "}
              {(byGenre.video.avg_collect_rate * 100).toFixed(2)}%
            </p>
          </div>
          <div className="rounded-lg border border-[#E7E5E4] bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[13px] font-medium text-[#1C1917]">图文</h3>
            <div className="text-[22px] font-bold text-[#1C1917]">
              {byGenre.image.count} 篇
            </div>
            <p className="mt-2 text-[12px] text-[#78716C]">
              平均互动率 {(byGenre.image.avg_interaction_rate * 100).toFixed(2)}
              % · 平均收藏率{" "}
              {(byGenre.image.avg_collect_rate * 100).toFixed(2)}%
            </p>
          </div>
        </div>
      )}

      <section className="overflow-visible rounded-lg border border-[#E7E5E4] bg-white">
        <h3 className="border-b border-[#E7E5E4] bg-[#FAFAF9] px-4 py-2.5 text-[13px] font-medium text-[#1C1917]">
          Top 10 笔记（按互动率降序）
        </h3>
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-[#E7E5E4] bg-[#FAFAF9]">
              <th className="px-3 py-2 text-left font-medium text-[#1C1917]">
                排名
              </th>
              <th className="px-3 py-2 text-left font-medium text-[#1C1917]">
                标题
              </th>
              <th className="px-3 py-2 text-left font-medium text-[#78716C]">
                体裁
              </th>
              <th className="px-3 py-2 text-right font-medium text-[#78716C]">
                曝光
              </th>
              <th className="px-3 py-2 text-right font-medium text-[#78716C]">
                互动率
              </th>
              <th className="px-3 py-2 text-right font-medium text-[#78716C]">
                收藏率
              </th>
              <th className="px-3 py-2 text-right font-medium text-[#78716C]">
                涨粉
              </th>
            </tr>
          </thead>
          <tbody>
            {top10.map((r) => (
              <tr key={r.rank} className="border-b border-[#E7E5E4]">
                <td className="px-3 py-2 align-top text-[#1C1917]">{r.rank}</td>
                <td className="max-w-[220px] px-3 py-2 align-top text-[#1C1917]">
                  <span className="block break-words leading-snug">{r.title}</span>
                  {r.is_paid && (
                    <span className="mt-0.5 inline-block rounded bg-[#1C1917] px-1.5 py-0.5 text-[9px] text-white">
                      投放
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-[#78716C]">
                  {r.genre || "-"}
                </td>
                <td className="px-3 py-2 text-right align-top text-[#78716C]">
                  {r.exposure.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right align-top text-[#78716C]">
                  {(r.interaction_rate * 100).toFixed(2)}%
                </td>
                <td className="px-3 py-2 text-right align-top text-[#78716C]">
                  {(r.collect_rate * 100).toFixed(2)}%
                </td>
                <td className="px-3 py-2 text-right align-top text-[#78716C]">
                  {r.follows.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {top10.length === 0 && (
          <div className="py-8 text-center text-[13px] text-[#78716C]">
            暂无数据
          </div>
        )}
      </section>
    </div>
  );
}
