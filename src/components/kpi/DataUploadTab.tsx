"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

/* ── types ──────────────────────────────────────────────── */

type DetectedType = "organic" | "paid" | "ig" | "notes_detail" | "daily_push" | "dict" | "unknown";

type UploadResult = {
  imported: number;
  newPosts: number;
  suspects: number;
  errors: string[];
} | null;

/* ── type detection ─────────────────────────────────────── */

const TYPE_LABELS: Record<DetectedType, string> = {
  organic: "Organic 数据（笔记列表明细表）",
  paid: "Paid 投放数据（笔记-投放数据）",
  ig: "Instagram 数据",
  notes_detail: "全部笔记明细（暂不支持）",
  daily_push: "Daily Push（暂不支持）",
  dict: "账号详情（暂不支持）",
  unknown: "未识别",
};

const SUPPORTED_TYPES = new Set<DetectedType>(["organic", "paid", "ig"]);

function detectType(fileName: string, firstRowHeaders: string[], isCSV: boolean): DetectedType {
  if (fileName.includes("笔记列表明细表")) return "organic";
  if (fileName.includes("笔记-投放数据")) return "paid";
  if (fileName.includes("全部笔记明细")) return "notes_detail";
  if (/^Daily/i.test(fileName) && /\.xlsx$/i.test(fileName)) return "daily_push";
  if (fileName.includes("新红-账号详情")) return "dict";
  if (isCSV && firstRowHeaders.some((h) => String(h).trim() === "Post ID")) return "ig";
  return "unknown";
}

/* ── column maps ────────────────────────────────────────── */

const ORGANIC_COL_MAP: Record<string, string> = {
  "笔记标题": "title",
  "发布时间": "publish_time",
  "首次发布时间": "publish_time",
  "体裁": "genre",
  "曝光": "exposure",
  "观看量": "views",
  "封面点击率": "cover_ctr",
  "点赞": "likes",
  "评论": "comments",
  "收藏": "collects",
  "涨粉": "follows",
  "分享": "shares",
  "人均观看时长": "avg_watch_time",
  "弹幕": "danmaku",
};

const PAID_COL_MAP: Record<string, string> = {
  "笔记/素材ID": "note_id",
  "笔记/素材链接": "link",
  "时间": "event_date",
  "消费": "spend",
  "展现量": "impressions",
  "点击量": "clicks",
  "点击率": "ctr",
  "平均点击成本": "cpc",
  "平均千次展示费用": "cpm",
  "互动量": "interactions",
  "平均互动成本": "cpe",
  "5s播放量": "play_5s",
  "5s完播率": "completion_5s",
  "新增种草人群": "new_seed",
  "新增种草人群成本": "new_seed_cost",
  "新增深度种草人群": "new_deep_seed",
  "新增深度种草人群成本": "new_deep_seed_cost",
  "私信进线数": "dm_in",
  "私信开口数": "dm_open",
  "私信留资数": "dm_lead",
  "私信进线成本": "dm_in_cost",
  "私信开口成本": "dm_open_cost",
  "私信留资成本": "dm_lead_cost",
};

const IG_COL_MAP: Record<string, string> = {
  "Post ID": "ig_post_id",
  "Publish time": "publish_time",
  "Account ID": "account_id",
  "Username": "account_username",
  "Account name": "account_name",
  "Description": "description",
  "Duration (sec)": "duration_sec",
  "Permalink": "permalink",
  "Post type": "post_type",
  "Views": "views",
  "Reach": "reach",
  "Likes": "likes",
  "Comments": "comments",
  "Saves": "saves",
  "Shares": "shares",
  "Follows": "follows",
};

/* ── mapping utils ──────────────────────────────────────── */

function pad(n: number) { return String(n).padStart(2, "0"); }

function fmtDate(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return s.slice(0, 10);
}

function fmtDateTime(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
  return String(v).trim();
}

function toPercent(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  let s = String(v).trim();
  if (s.includes("%") || s.includes("％")) s = s.replace(/[%％]/g, "");
  const n = Number(s);
  if (isNaN(n)) return 0;
  return Math.abs(n) > 1 ? n / 100 : n;
}

function mapRow(row: Record<string, unknown>, colMap: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const mapped = colMap[key.trim()];
    if (mapped) out[mapped] = value;
  }
  return out;
}

function processOrganic(raw: Record<string, unknown>[]): Record<string, unknown>[] {
  return raw
    .map((r) => {
      const m = mapRow(r, ORGANIC_COL_MAP);
      if (!m.title) return null;
      if (m.publish_time) m.publish_time = fmtDateTime(m.publish_time);
      if (m.cover_ctr !== undefined) m.cover_ctr = toPercent(m.cover_ctr);
      return m;
    })
    .filter(Boolean) as Record<string, unknown>[];
}

function processPaid(raw: Record<string, unknown>[]): Record<string, unknown>[] {
  return raw
    .map((r) => {
      const m = mapRow(r, PAID_COL_MAP);
      if (!m.note_id) return null;
      if (m.event_date) m.event_date = fmtDate(m.event_date);
      if (m.ctr !== undefined) m.ctr = toPercent(m.ctr);
      if (m.completion_5s !== undefined) m.completion_5s = toPercent(m.completion_5s);
      return m;
    })
    .filter(Boolean) as Record<string, unknown>[];
}

function processIg(raw: Record<string, unknown>[]): Record<string, unknown>[] {
  return raw
    .map((r) => {
      const m = mapRow(r, IG_COL_MAP);
      if (!m.ig_post_id) return null;
      if (m.publish_time) m.publish_time = fmtDateTime(m.publish_time);
      return m;
    })
    .filter(Boolean) as Record<string, unknown>[];
}

function parseIgSnapshotDate(filename: string): string {
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const re = /([A-Z][a-z]{2})-(\d{1,2})-(\d{4})/g;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filename)) !== null) last = m;
  if (last) {
    const mo = months[last[1]];
    if (mo) return `${last[3]}-${mo}-${last[2].padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}

/* ── preview columns per type ───────────────────────────── */

const PREVIEW_COLS: Record<string, { key: string; label: string }[]> = {
  organic: [
    { key: "title", label: "标题" },
    { key: "publish_time", label: "发布时间" },
    { key: "exposure", label: "曝光" },
    { key: "likes", label: "点赞" },
    { key: "cover_ctr", label: "封面点击率" },
  ],
  paid: [
    { key: "note_id", label: "素材ID" },
    { key: "event_date", label: "日期" },
    { key: "spend", label: "消费" },
    { key: "impressions", label: "展现量" },
    { key: "ctr", label: "点击率" },
  ],
  ig: [
    { key: "ig_post_id", label: "Post ID" },
    { key: "publish_time", label: "Publish time" },
    { key: "views", label: "Views" },
    { key: "reach", label: "Reach" },
    { key: "likes", label: "Likes" },
  ],
};

/* ── component ──────────────────────────────────────────── */

export function DataUploadTab() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [detectedType, setDetectedType] = useState<DetectedType>("unknown");
  const [rowCount, setRowCount] = useState(0);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().slice(0, 10));
  const [igSnapshotDate, setIgSnapshotDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setDetectedType("unknown");
    setRowCount(0);
    setParsedRows([]);
    setSnapshotDate(new Date().toISOString().slice(0, 10));
    setIgSnapshotDate("");
    setResult(null);
    setError(null);
  };

  const processFile = useCallback(async (f: File) => {
    setFile(f);
    setResult(null);
    setError(null);

    try {
      const ab = await f.arrayBuffer();
      const isCSV = f.name.toLowerCase().endsWith(".csv");
      const wb = XLSX.read(ab, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];

      const firstRow = ((XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][])[0] ?? []).map(String);
      const type = detectType(f.name, firstRow, isCSV);
      setDetectedType(type);

      if (!SUPPORTED_TYPES.has(type)) {
        if (type === "unknown") setError("无法识别文件类型，请确认文件名");
        return;
      }

      let rawRows: Record<string, unknown>[];
      if (type === "organic") {
        rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: 1 });
      } else if (type === "paid") {
        const all = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        rawRows = all.slice(1);
      } else {
        rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      }

      if (!rawRows.length) { setError("文件为空"); return; }

      let mapped: Record<string, unknown>[];
      if (type === "organic") mapped = processOrganic(rawRows);
      else if (type === "paid") mapped = processPaid(rawRows);
      else mapped = processIg(rawRows);

      setRowCount(mapped.length);
      setParsedRows(mapped);

      if (type === "ig") {
        const igDate = parseIgSnapshotDate(f.name);
        setIgSnapshotDate(igDate);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "文件解析失败");
    }
  }, []);

  const handleUpload = async () => {
    if (!parsedRows.length || !SUPPORTED_TYPES.has(detectedType)) return;
    setUploading(true);
    setError(null);
    try {
      const sd = detectedType === "ig" ? igSnapshotDate : snapshotDate;
      const res = await fetch("/api/kpi/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: detectedType, rows: parsedRows, snapshot_date: sd }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  }, [processFile]);

  const previewCols = PREVIEW_COLS[detectedType] ?? [];
  const previewRows = parsedRows.slice(0, 5);

  return (
    <div className="space-y-5">
      {/* upload area */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => fileRef.current?.click()}
        className={cn(
          "flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-sm transition-colors",
          dragging ? "border-[#1C1917] bg-[#F5F5F4]" : "border-[#E7E5E4] bg-[#FAFAF9] hover:border-[#78716C]"
        )}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
        <Upload className="mb-3 h-10 w-10 text-[#A8A29E]" />
        <p className="text-[#78716C]">拖拽或点击上传 Excel / CSV</p>
        <p className="mt-1.5 text-xs text-[#A8A29E]">支持：笔记列表明细表 · 笔记-投放数据 · Instagram CSV</p>
      </div>

      {/* file info + type badge */}
      {file && (
        <div className="rounded-lg bg-white p-5 shadow-card">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-8 w-8 shrink-0 text-[#A8A29E]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[#1C1917]">{file.name}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-[#A8A29E]">
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  SUPPORTED_TYPES.has(detectedType) ? "bg-emerald-50 text-emerald-700" : detectedType === "unknown" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
                )}>
                  {TYPE_LABELS[detectedType]}
                </span>
                {rowCount > 0 && <span>{rowCount} 条有效数据</span>}
              </div>
            </div>
            <button type="button" onClick={reset} className="rounded p-1.5 text-[#A8A29E] hover:bg-[#F5F5F4]" title="重新选择">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          {/* snapshot date picker for Organic */}
          {detectedType === "organic" && (
            <div className="mt-4 flex items-center gap-3">
              <label className="text-xs text-[#78716C]">快照日期</label>
              <input
                type="date"
                value={snapshotDate}
                onChange={(e) => setSnapshotDate(e.target.value)}
                className="h-9 rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
              />
              <span className="text-[10px] text-[#A8A29E]">该日期会作为 snapshot_date 写入</span>
            </div>
          )}

          {/* IG snapshot date (auto-detected, display only) */}
          {detectedType === "ig" && igSnapshotDate && (
            <div className="mt-4 flex items-center gap-3">
              <label className="text-xs text-[#78716C]">快照日期（从文件名解析）</label>
              <span className="text-sm font-medium text-[#1C1917]">{igSnapshotDate}</span>
            </div>
          )}
        </div>
      )}

      {/* preview table */}
      {previewRows.length > 0 && previewCols.length > 0 && (
        <div className="rounded-lg bg-white p-5 shadow-card">
          <h4 className="mb-3 text-xs font-medium text-[#78716C]">数据预览（前 5 行）</h4>
          <div className="overflow-x-auto rounded-lg border border-[#E7E5E4]">
            <table className="w-full text-xs">
              <thead className="bg-[#FAFAF9] text-[#78716C]">
                <tr>
                  {previewCols.map((c) => (
                    <th key={c.key} className="px-3 py-2 text-left font-medium">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F4]">
                {previewRows.map((row, i) => (
                  <tr key={i} className="hover:bg-[#FAFAF9]">
                    {previewCols.map((c) => (
                      <td key={c.key} className="max-w-[200px] truncate px-3 py-2 text-[#1C1917]">
                        {row[c.key] !== null && row[c.key] !== undefined ? String(row[c.key]) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[#1C1917] px-5 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              确认上传
            </button>
          </div>
        </div>
      )}

      {/* result */}
      {result && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-green-800">
            <CheckCircle className="h-4 w-4" /> 上传成功
          </div>
          <div className="mt-1.5 space-y-0.5 text-xs text-green-700">
            <p>成功导入 <strong>{result.imported}</strong> 条{detectedType === "paid" ? "记录" : "快照"}</p>
            <p>新增 <strong>{result.newPosts}</strong> 个帖子</p>
            {result.suspects > 0 && (
              <p className="text-amber-600">疑似重复 <strong>{result.suspects}</strong> 条</p>
            )}
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2 text-xs text-red-600">
              {result.errors.length} 个错误：{result.errors.slice(0, 3).join("；")}
            </div>
          )}
        </div>
      )}

      {/* error */}
      {error && !result && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="mb-1 inline h-4 w-4" /> {error}
        </div>
      )}
    </div>
  );
}
