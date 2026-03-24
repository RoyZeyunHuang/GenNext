"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Eye, Trash2, X, Loader2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  downloadDomAsPdf,
  safePdfFilename,
} from "@/lib/exportCampaignReportPdf";
import {
  loadNotesReportData,
  type NotesReportBundle,
} from "@/lib/kpiNotesReportData";
import { CampaignReportPdfDocument } from "./CampaignReportPdfDocument";
import { NotesTab } from "./NotesTab";

type Report = {
  id: string;
  title: string;
  summary: string | null;
  date_from: string;
  date_to: string;
  aggregate_json: string | null;
  top_posts_json: string | null;
  created_at: string;
};

export function CampaignReportTab() {
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
            reports.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  selected?.id === r.id
                    ? "border-[#1C1917] bg-[#FAFAF9]"
                    : "border-[#E7E5E4] bg-white"
                )}
              >
                <div className="text-sm font-medium text-[#1C1917]">{r.title}</div>
                <div className="mt-0.5 text-xs text-[#78716C]">
                  {r.date_from} → {r.date_to}
                </div>
                <div className="mt-0.5 text-[10px] text-[#A8A29E]">
                  {new Date(r.created_at).toLocaleDateString("zh-CN")}
                </div>
                <div className="mt-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(r);
                      setCreating(false);
                    }}
                    className="flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] text-[#78716C] hover:bg-[#F5F5F4]"
                  >
                    <Eye className="h-3 w-3" /> View
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteReport(r.id)}
                    className="flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="rounded-lg bg-white p-6 shadow-card">
        {creating ? (
          <NewReportForm
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

/** 与 KPI「全量笔记」Tab 相同；PDF 使用独立 794px 排版页截图，避免裁切 */
function ReportView({ report }: { report: Report }) {
  const pdfPageRef = useRef<HTMLDivElement>(null);
  const [pdfWorking, setPdfWorking] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfBundle, setPdfBundle] = useState<NotesReportBundle | null>(null);
  const hasRange = Boolean(report.date_from && report.date_to);
  const filters = {
    from_date: report.date_from,
    to_date: report.date_to,
    account_names: [] as string[],
  };

  const handleDownloadPdf = async () => {
    if (!hasRange) return;
    setPdfWorking(true);
    setPdfError(null);
    const result = await loadNotesReportData({
      from_date: report.date_from,
      to_date: report.date_to,
      account_names: [],
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
              onClick={handleDownloadPdf}
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
                → {report.date_to}）
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

function NewReportForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (r: Report) => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      <p className="mb-3 text-xs text-[#78716C]">
        保存后，报告详情页将展示与 KPI「全量笔记」相同的指标、趋势图与 Top
        10 列表；日期范围请与全量笔记页顶栏一致以便口径对齐。
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
      </div>
      <button
        type="button"
        onClick={save}
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
