"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Plus, Trash2, X, Loader2, Download } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  downloadDomAsPdf,
  safePdfFilename,
} from "@/lib/exportCampaignReportPdf";
import {
  loadNotesReportData,
  type NotesReportBundle,
} from "@/lib/kpiNotesReportData";
import {
  CampaignReportPdfDocument,
  CampaignPaidCampaignPdfDocument,
} from "./CampaignReportPdfDocument";
import { NotesTab } from "./NotesTab";

type Report = {
  id: string;
  title: string;
  summary: string | null;
  date_from: string;
  date_to: string;
  aggregate_json: string | null;
  top_posts_json: string | null;
  note_keys_json?: string | null;
  /** 投放 Campaign：笔记仅来自 xhs_paid_daily，指标为投放口径 */
  is_paid_campaign?: boolean | null;
  created_at: string;
};

type PaidCampaignTrendPoint = {
  date: string;
  exposure: number;
  interactions: number;
  interaction_rate: number;
};

type PaidCampaignMetrics = {
  spend: number;
  note_count: number;
  impressions: number;
  interactions: number;
  completion_5s_rate: number;
  /** 按展现加权的平均点击率，0–1 小数 */
  avg_ctr: number;
  trend: PaidCampaignTrendPoint[];
};

function parseIsPaidCampaign(report: Report): boolean {
  return report.is_paid_campaign === true;
}

async function fetchPaidCampaignMetrics(opts: {
  dateFrom: string;
  dateTo: string;
  noteIds?: string[];
}): Promise<PaidCampaignMetrics | null> {
  const params = new URLSearchParams({
    from: opts.dateFrom,
    to: opts.dateTo,
  });
  if (opts.noteIds?.length) {
    for (const id of opts.noteIds) {
      params.append("note_id", id);
    }
  } else {
    params.set("all_paid_in_range", "1");
  }
  const res = await fetch(
    `/api/kpi/campaign-paid-campaign-metrics?${params}`,
    { cache: "no-store" }
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || typeof data.spend !== "number") return null;
  const m = data as PaidCampaignMetrics;
  if (!Array.isArray(m.trend)) m.trend = [];
  return m;
}

/** 与全量 NotesTab KPI 卡片同样式（无同比） */
function PaidKpiCard({
  label,
  value,
  format = "number",
}: {
  label: string;
  value: number;
  format?: "number" | "percent" | "currency";
}) {
  let display: string;
  if (format === "percent") {
    display = `${(value * 100).toFixed(2)}%`;
  } else if (format === "currency") {
    display = `¥${value.toLocaleString()}`;
  } else {
    display = value.toLocaleString();
  }
  return (
    <div className="rounded-lg bg-white p-5 shadow-card">
      <div className="text-sm text-[#78716C]">{label}</div>
      <div className="mt-2 text-3xl font-bold text-[#1C1917]">{display}</div>
    </div>
  );
}

function parseReportNoteKeys(report: Report): string[] | undefined {
  const raw = report.note_keys_json;
  if (raw == null || raw === "") return undefined;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return undefined;
    const keys = arr.map((k) => String(k).trim()).filter(Boolean);
    return keys.length > 0 ? keys : undefined;
  } catch {
    return undefined;
  }
}

export function CampaignReportTab({
  notesDataVersion = 0,
}: {
  /** KPI 上传笔记成功后递增，用于刷新 Campaign 新建表单里的候选笔记列表 */
  notesDataVersion?: number;
}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Report | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchReports = useCallback(async () => {
    const res = await fetch("/api/kpi/campaign-reports");
    const data = await res.json().catch(() => []);
    setReports(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const deleteReport = async (id: string) => {
    await fetch(`/api/kpi/campaign-reports/${id}`, { method: "DELETE" });
    setReports((prev) => prev.filter((r) => r.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-[#1C1917]">报告列表</span>
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setSelected(null);
            }}
            className="flex items-center gap-1 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1C1917]/90"
          >
            <Plus className="h-3.5 w-3.5" /> New Report
          </button>
        </div>
        <div className="max-h-[560px] space-y-2 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-[#78716C]">加载中…</p>
          ) : reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#78716C]">暂无报告</p>
          ) : (
            reports.map((r) => {
              const nk = parseReportNoteKeys(r);
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelected(r);
                    setCreating(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(r);
                      setCreating(false);
                    }
                  }}
                  className={cn(
                    "cursor-pointer rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#1C1917]/30",
                    selected?.id === r.id
                      ? "border-[#1C1917] bg-[#FAFAF9]"
                      : "border-[#E7E5E4] bg-white hover:border-[#D6D3D1]"
                  )}
                >
                  <div className="text-sm font-medium text-[#1C1917]">
                    {r.title}
                  </div>
                  <div className="mt-0.5 text-xs text-[#78716C]">
                    {r.date_from} → {r.date_to}
                    <span className="ml-1 text-[#A8A29E]">
                      · {parseIsPaidCampaign(r) ? "投放" : "全量"}
                    </span>
                    {nk?.length ? (
                      <span className="ml-1 text-[#A8A29E]">
                        · 已选 {nk.length} 篇
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#A8A29E]">
                    {new Date(r.created_at).toLocaleDateString("zh-CN")}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteReport(r.id);
                      }}
                      className="flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="rounded-lg bg-white p-6 shadow-card">
        {creating ? (
          <NewReportForm
            notesDataVersion={notesDataVersion}
            onClose={() => setCreating(false)}
            onCreated={(r) => {
              setReports((prev) => [r, ...prev]);
              setCreating(false);
              setSelected(r);
            }}
          />
        ) : selected ? (
          <ReportView report={selected} />
        ) : (
          <p className="py-20 text-center text-sm text-[#78716C]">
            选择左侧报告查看，或点击「New Report」
          </p>
        )}
      </div>
    </div>
  );
}

function ReportView({ report }: { report: Report }) {
  if (parseIsPaidCampaign(report)) {
    return <PaidCampaignReportView report={report} />;
  }
  return <OrganicCampaignReportView report={report} />;
}

function PaidCampaignReportView({ report }: { report: Report }) {
  const pdfPageRef = useRef<HTMLDivElement>(null);
  const [pdfWorking, setPdfWorking] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfMetrics, setPdfMetrics] = useState<PaidCampaignMetrics | null>(null);
  const [metrics, setMetrics] = useState<PaidCampaignMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const hasRange = Boolean(report.date_from && report.date_to);
  const selectedNoteIds = parseReportNoteKeys(report);
  const noteIdsSig = selectedNoteIds?.length
    ? selectedNoteIds.join("\u0001")
    : "";

  useEffect(() => {
    if (!hasRange) {
      setMetrics(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      const data = await fetchPaidCampaignMetrics({
        dateFrom: report.date_from,
        dateTo: report.date_to,
        noteIds: selectedNoteIds,
      });
      if (cancelled) return;
      if (!data) {
        setErr("投放数据加载失败");
        setMetrics(null);
      } else {
        setMetrics(data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    hasRange,
    report.id,
    report.date_from,
    report.date_to,
    noteIdsSig,
  ]);

  useEffect(() => {
    if (!pdfMetrics) return;
    let cancelled = false;
    const run = async () => {
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r))
      );
      await new Promise((r) => setTimeout(r, 900));
      if (cancelled) return;
      const el = pdfPageRef.current;
      if (!el) {
        if (!cancelled) {
          setPdfError("PDF 页面未渲染");
          setPdfWorking(false);
        }
        setPdfMetrics(null);
        return;
      }
      try {
        await downloadDomAsPdf(el, safePdfFilename(report.title));
      } catch (e) {
        if (!cancelled) {
          setPdfError(e instanceof Error ? e.message : "导出 PDF 失败");
        }
      } finally {
        if (!cancelled) {
          setPdfWorking(false);
          setPdfMetrics(null);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [pdfMetrics, report.title]);

  const handleDownloadPdf = async () => {
    if (!hasRange) return;
    setPdfWorking(true);
    setPdfError(null);
    const data = await fetchPaidCampaignMetrics({
      dateFrom: report.date_from,
      dateTo: report.date_to,
      noteIds: selectedNoteIds,
    });
    if (!data) {
      setPdfError("无法生成 PDF：投放数据加载失败");
      setPdfWorking(false);
      return;
    }
    setPdfMetrics(data);
  };

  return (
    <div className="space-y-6">
      {!hasRange ? (
        <p className="text-sm text-[#78716C]">该报告缺少日期范围。</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-xs text-[#A8A29E]">
              投放 Campaign
              数据来自「笔记投放数据」上传的 xhs_paid_daily，与下方汇总一致。
            </p>
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={pdfWorking}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-50"
            >
              {pdfWorking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {pdfWorking ? "生成 PDF…" : "下载 PDF"}
            </button>
          </div>
          {pdfError && (
            <p className="text-xs text-red-600">{pdfError}</p>
          )}
          <div>
            <h3 className="text-lg font-semibold text-[#1C1917]">
              {report.title}
            </h3>
            {report.summary && (
              <p className="mt-1 text-sm text-[#78716C]">{report.summary}</p>
            )}
            <p className="mt-1 text-xs text-[#A8A29E]">
              日期：{report.date_from} → {report.date_to}
              {selectedNoteIds?.length
                ? ` · 已选 ${selectedNoteIds.length} 个笔记 ID`
                : " · 该范围内全部投放笔记"}
            </p>
          </div>

          {loading && !metrics ? (
            <div className="py-20 text-center text-sm text-[#78716C]">
              加载中…
            </div>
          ) : err ? (
            <p className="text-sm text-red-600">{err}</p>
          ) : metrics ? (
            <>
              <div className="grid grid-cols-3 gap-4">
                <PaidKpiCard
                  label="消费"
                  value={metrics.spend}
                  format="currency"
                />
                <PaidKpiCard label="笔记数" value={metrics.note_count} />
                <PaidKpiCard label="总曝光" value={metrics.impressions} />
                <PaidKpiCard label="总互动" value={metrics.interactions} />
                <PaidKpiCard
                  label="5s 完播率"
                  value={metrics.completion_5s_rate}
                  format="percent"
                />
                <PaidKpiCard
                  label="平均点击率"
                  value={metrics.avg_ctr}
                  format="percent"
                />
              </div>

              {metrics.trend.length <= 2 ? (
                <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] px-5 py-8 text-center text-sm text-[#78716C]">
                  持续上传投放数据后可查看完整趋势
                </div>
              ) : (
                <div className="rounded-lg bg-white p-5 shadow-card">
                  <h4 className="mb-4 text-sm font-medium text-[#1C1917]">
                    趋势
                  </h4>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={metrics.trend}
                        margin={{ left: 20, right: 50 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#78716C", fontSize: 12 }}
                        />
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
                          formatter={(value, name) => {
                            const v = Number(value ?? 0);
                            if (String(name) === "平均互动率") {
                              return [`${(v * 100).toFixed(2)}%`, String(name)];
                            }
                            return [v.toLocaleString(), String(name)];
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
          ) : null}

          {pdfMetrics && (
            <div
              ref={pdfPageRef}
              className="pointer-events-none overflow-visible"
              style={{
                position: "fixed",
                left: -14000,
                top: 0,
                zIndex: 2147483646,
                width: 794,
              }}
              aria-hidden
            >
              <CampaignPaidCampaignPdfDocument
                report={{
                  title: report.title,
                  summary: report.summary,
                  date_from: report.date_from,
                  date_to: report.date_to,
                }}
                metrics={pdfMetrics}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 与 KPI「全量笔记」Tab 相同；PDF 使用独立 794px 排版页截图，避免裁切 */
function OrganicCampaignReportView({ report }: { report: Report }) {
  const pdfPageRef = useRef<HTMLDivElement>(null);
  const [pdfWorking, setPdfWorking] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfBundle, setPdfBundle] = useState<NotesReportBundle | null>(null);

  const hasRange = Boolean(report.date_from && report.date_to);
  const noteKeys = parseReportNoteKeys(report);
  const filters = {
    from_date: report.date_from,
    to_date: report.date_to,
    account_names: [] as string[],
    note_keys: noteKeys,
  };

  const handleDownloadPdf = async () => {
    if (!hasRange) return;
    setPdfWorking(true);
    setPdfError(null);
    const result = await loadNotesReportData({
      from_date: report.date_from,
      to_date: report.date_to,
      account_names: [],
      note_keys: noteKeys,
    });
    if (!result.ok) {
      setPdfError(result.error);
      setPdfWorking(false);
      return;
    }
    setPdfBundle(result.data);
  };

  useEffect(() => {
    if (!pdfBundle) return;
    let cancelled = false;
    const run = async () => {
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r))
      );
      await new Promise((r) => setTimeout(r, 900));
      if (cancelled) return;
      const el = pdfPageRef.current;
      if (!el) {
        if (!cancelled) {
          setPdfError("PDF 页面未渲染");
          setPdfWorking(false);
        }
        setPdfBundle(null);
        return;
      }
      try {
        await downloadDomAsPdf(el, safePdfFilename(report.title));
      } catch (e) {
        if (!cancelled) {
          setPdfError(e instanceof Error ? e.message : "导出 PDF 失败");
        }
      } finally {
        if (!cancelled) {
          setPdfWorking(false);
          setPdfBundle(null);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [pdfBundle, report.title]);

  return (
    <div className="space-y-4">
      {!hasRange ? (
        <p className="text-sm text-[#78716C]">
          该报告缺少日期范围，无法展示全量笔记分析。
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-xs text-[#A8A29E]">
              下载 PDF
              时会生成专用排版页（794px 宽、完整纵向内容），与下方展示数据一致，避免在仪表盘容器内截图被裁切。
            </p>
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={pdfWorking}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-50"
            >
              {pdfWorking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {pdfWorking ? "生成 PDF…" : "下载 PDF"}
            </button>
          </div>
          {pdfError && (
            <p className="text-xs text-red-600">{pdfError}</p>
          )}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[#1C1917]">
                {report.title}
              </h3>
              {report.summary && (
                <p className="mt-1 text-sm text-[#78716C]">{report.summary}</p>
              )}
              <p className="mt-1 text-xs text-[#A8A29E]">
                以下数据与 KPI「全量笔记」一致（日期范围：{report.date_from}{" "}
                → {report.date_to}
                {noteKeys?.length ? ` · 仅统计已选 ${noteKeys.length} 篇笔记` : ""}）
              </p>
            </div>

            <NotesTab filters={filters} refreshToken={0} />
          </div>

          {pdfBundle && (
            <div
              ref={pdfPageRef}
              className="pointer-events-none overflow-visible"
              style={{
                position: "fixed",
                left: -14000,
                top: 0,
                zIndex: 2147483646,
                width: 794,
              }}
              aria-hidden
            >
              <CampaignReportPdfDocument
                report={{
                  title: report.title,
                  summary: report.summary,
                  date_from: report.date_from,
                  date_to: report.date_to,
                }}
                comparison={pdfBundle.comparison}
                byGenre={pdfBundle.byGenre}
                top10={pdfBundle.top10}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

type NoteOption = { key: string; title: string; note_id: string | null };

function NewReportForm({
  notesDataVersion = 0,
  onClose,
  onCreated,
}: {
  notesDataVersion?: number;
  onClose: () => void;
  onCreated: (r: Report) => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isPaidCampaign, setIsPaidCampaign] = useState(false);
  const [options, setOptions] = useState<NoteOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [pickSearch, setPickSearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  /** 手动刷新候选列表（与日期、上传无关时） */
  const [listRefreshNonce, setListRefreshNonce] = useState(0);

  const inputCls =
    "h-9 rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20";

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const firstDay = new Date();
    firstDay.setDate(1);
    const monthStart = firstDay.toISOString().slice(0, 10);
    setDateFrom((prev) => prev || monthStart);
    setDateTo((prev) => prev || today);
  }, []);

  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    let cancelled = false;
    (async () => {
      setOptionsLoading(true);
      try {
        const params = new URLSearchParams({
          from_date: dateFrom,
          to_date: dateTo,
          _cb: String(Date.now()),
        });
        const path = isPaidCampaign
          ? "/api/kpi/campaign-report-paid-note-options"
          : "/api/kpi/campaign-report-note-options";
        const res = await fetch(`${path}?${params}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          const next = Array.isArray(data.options) ? data.options : [];
          setOptions(next);
          const allowed = new Set(next.map((o: NoteOption) => o.key));
          setSelectedKeys((prev) => prev.filter((k) => allowed.has(k)));
        }
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, notesDataVersion, listRefreshNonce, isPaidCampaign]);

  const filteredOptions = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.title.toLowerCase().includes(q) ||
        (o.note_id && o.note_id.toLowerCase().includes(q)) ||
        o.key.toLowerCase().includes(q)
    );
  }, [options, pickSearch]);

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllKeys = () => setSelectedKeys(options.map((o) => o.key));
  const clearKeys = () => setSelectedKeys([]);

  const save = async () => {
    if (!title.trim() || !dateFrom || !dateTo) return;
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/kpi/campaign-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          summary,
          date_from: dateFrom,
          date_to: dateTo,
          aggregate_json: {},
          top_posts_json: [],
          note_keys: selectedKeys.length > 0 ? selectedKeys : [],
          is_paid_campaign: isPaidCampaign,
        }),
      });
      const report = await res.json().catch(() => ({}));
      if (!res.ok || report.error) {
        setSaveError(
          typeof report.error === "string"
            ? report.error
            : `保存失败（HTTP ${res.status}）`
        );
        return;
      }
      onCreated(report as Report);
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "保存失败，请稍后重试。"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[#1C1917]">新建 Campaign Report</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-3">
        <div className="text-xs font-medium text-[#1C1917]">Campaign 类型</div>
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex cursor-pointer items-start gap-2 text-xs text-[#1C1917]">
            <input
              type="radio"
              name="campaign_kind"
              checked={!isPaidCampaign}
              onChange={() => {
                setIsPaidCampaign(false);
                setSelectedKeys([]);
              }}
              className="mt-0.5 shrink-0"
            />
            <span>
              <span className="font-medium">全量笔记 Campaign</span>
              <span className="mt-0.5 block font-normal text-[#78716C]">
                候选来自全量笔记快照，口径与 KPI「全量笔记」一致。
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-xs text-[#1C1917]">
            <input
              type="radio"
              name="campaign_kind"
              checked={isPaidCampaign}
              onChange={() => {
                setIsPaidCampaign(true);
                setSelectedKeys([]);
              }}
              className="mt-0.5 shrink-0"
            />
            <span>
              <span className="font-medium">投放 Campaign</span>
              <span className="mt-0.5 block font-normal text-[#78716C]">
                候选仅来自「笔记投放数据」上传的投放表（xhs_paid_daily），按笔记
                ID 匹配；报告展示消费、笔记数、总曝光、总互动、5s 完播率、平均点击率。
              </span>
            </span>
          </label>
        </div>
      </div>

      <p className="mb-3 text-xs text-[#78716C]">
        {isPaidCampaign
          ? "在下方勾选投放笔记（不勾选则统计该日期范围内全部投放笔记）。"
          : "保存后展示与 KPI「全量笔记」相同口径；可在下方勾选仅包含的笔记（不勾选则包含该日期范围内全部笔记）。"}
      </p>
      <div className="grid gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="报告标题 *"
          className={inputCls}
        />
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="摘要（可选）"
          rows={2}
          className={cn(inputCls, "h-auto resize-none py-2")}
        />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-[#78716C]">日期范围</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputCls}
          />
          <span className="text-[#A8A29E]">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#1C1917]">
              {isPaidCampaign ? "包含投放笔记" : "包含笔记"}{" "}
              <span className="font-normal text-[#78716C]">
                （已选 {selectedKeys.length}/{options.length}）
              </span>
            </span>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setListRefreshNonce((n) => n + 1)}
                disabled={optionsLoading || !dateFrom || !dateTo}
                className="rounded px-2 py-0.5 text-[10px] text-[#78716C] hover:bg-[#F5F5F4] disabled:opacity-40"
              >
                刷新列表
              </button>
              <button
                type="button"
                onClick={selectAllKeys}
                disabled={options.length === 0}
                className="rounded px-2 py-0.5 text-[10px] text-[#78716C] hover:bg-[#F5F5F4] disabled:opacity-40"
              >
                全选
              </button>
              <button
                type="button"
                onClick={clearKeys}
                className="rounded px-2 py-0.5 text-[10px] text-[#78716C] hover:bg-[#F5F5F4]"
              >
                清空
              </button>
            </div>
          </div>
          <input
            value={pickSearch}
            onChange={(e) => setPickSearch(e.target.value)}
            placeholder={isPaidCampaign ? "搜索标题或笔记 ID…" : "搜索标题或笔记 ID…"}
            className={cn(inputCls, "mb-2 w-full")}
          />
          {optionsLoading ? (
            <p className="py-4 text-center text-xs text-[#78716C]">加载候选…</p>
          ) : options.length === 0 ? (
            <p className="py-2 text-xs text-[#A8A29E]">
              {isPaidCampaign
                ? "该日期范围内暂无投放数据，请先上传「笔记投放数据」"
                : "该日期范围内暂无笔记"}
            </p>
          ) : (
            <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
              {filteredOptions.map((o) => (
                <label
                  key={o.key}
                  className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-white"
                >
                  <input
                    type="checkbox"
                    checked={selectedKeys.includes(o.key)}
                    onChange={() => toggleKey(o.key)}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0 text-[#1C1917]">
                    <span className="line-clamp-2 font-medium">{o.title}</span>
                    {o.note_id ? (
                      <span className="mt-0.5 block text-[10px] text-[#A8A29E]">
                        ID {o.note_id}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
              {filteredOptions.length === 0 && options.length > 0 ? (
                <p className="py-2 text-center text-xs text-[#A8A29E]">无匹配项</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !title.trim() || !dateFrom || !dateTo}
        title={
          !title.trim()
            ? "请填写标题"
            : !dateFrom || !dateTo
              ? "请选择起止日期"
              : undefined
        }
        className="mt-4 flex h-9 items-center gap-1 rounded-lg bg-[#1C1917] px-4 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        保存报告
      </button>
      {saveError && (
        <p className="mt-2 text-xs text-red-600">{saveError}</p>
      )}
    </div>
  );
}
