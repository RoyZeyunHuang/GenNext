"use client";

import { useState, useCallback } from "react";
import { X, Upload, FileSpreadsheet, FileText } from "lucide-react";

function detectType(filename: string): "organic" | "paid" | null {
  const lower = filename.toLowerCase();
  if (lower.includes("笔记列表明细")) return "organic";
  if (lower.includes("笔记投放数据") || lower.includes("投放")) return "paid";
  return null;
}

function toDateInputValue(ms?: number): string {
  if (!ms || Number.isNaN(ms)) return new Date().toISOString().slice(0, 10);
  return new Date(ms).toISOString().slice(0, 10);
}

type Props = {
  onClose: () => void;
  /** 上传成功时调用，笔记快照时传入本次使用的 snapshot_date 便于父组件刷新并选中该日期 */
  onSuccess: (uploadedSnapshotDate?: string) => void | Promise<void>;
};

export function UploadModal({ onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [snapshotDate, setSnapshotDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    type: string;
    message: string;
    imported?: number;
    skipped?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detectedType = file ? detectType(file.name) : null;
  const applySelectedFile = useCallback((f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
    if (detectType(f.name) === "organic") {
      // 浏览器可拿到的文件元数据里没有“Date Added”，这里使用 lastModified 作为最接近的日期来源
      setSnapshotDate(toDateInputValue(f.lastModified));
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      applySelectedFile(f);
    }
  }, [applySelectedFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      applySelectedFile(f);
    }
  }, [applySelectedFile]);

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    const type = detectType(file.name);
    if (!type) {
      setError("无法识别文件类型，请使用「笔记列表明细」或「笔记投放数据/投放」相关文件名");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (type === "organic") form.append("snapshot_date", snapshotDate);
      const res = await fetch("/api/kpi/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "上传失败");
        return;
      }
      setResult({
        type: data.type === "organic" ? "笔记快照" : "投放日报",
        message: data.message || `成功导入 ${data.imported ?? 0} 条`,
        imported: data.imported,
        skipped: data.skipped,
      });
      setFile(null);
      const snapshotFromServer =
        type === "organic"
          ? String(data.snapshot_date || snapshotDate)
          : undefined;
      await onSuccess(snapshotFromServer);
    } finally {
      setUploading(false);
    }
  }, [file, snapshotDate, onSuccess]);

  const handleClose = useCallback(() => {
    setFile(null);
    setResult(null);
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E7E5E4] px-4 py-3">
          <h3 className="text-lg font-semibold text-[#1C1917]">上传数据</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              drag ? "border-[#1C1917] bg-[#FAFAF9]" : "border-[#E7E5E4] bg-white"
            }`}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileInput}
              className="hidden"
              id="kpi-upload-file"
            />
            <label
              htmlFor="kpi-upload-file"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <Upload className="h-10 w-10 text-[#A8A29E]" />
              <span className="text-sm text-[#78716C]">
                拖拽文件到此处，或点击选择
              </span>
            </label>
            {file && (
              <div className="mt-3 flex items-center justify-center gap-2 text-sm text-[#1C1917]">
                {detectedType === "organic" ? (
                  <FileSpreadsheet className="h-4 w-4" />
                ) : detectedType === "paid" ? (
                  <FileText className="h-4 w-4" />
                ) : null}
                <span>{file.name}</span>
              </div>
            )}
          </div>

          {detectedType === "organic" && (
            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-1">
                快照日期
              </label>
              <input
                type="date"
                value={snapshotDate}
                onChange={(e) => setSnapshotDate(e.target.value)}
                className="w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
              />
              {file && (
                <p className="mt-1 text-xs text-[#A8A29E]">
                  已按文件元数据（last modified）自动填充，可手动修改
                </p>
              )}
            </div>
          )}

          {detectedType && (
            <p className="text-sm text-[#78716C]">
              检测到：{detectedType === "organic" ? "笔记快照数据" : "投放日报数据"}
            </p>
          )}

          {detectedType === null && file && (
            <p className="text-sm text-[#DC2626]">
              无法识别文件类型，请使用「笔记列表明细」或「笔记投放数据/投放」相关文件名
            </p>
          )}

          {error && (
            <p className="text-sm text-[#DC2626]">{error}</p>
          )}

          {result && (
            <div className="rounded-lg bg-[#ECFDF5] px-3 py-2 text-sm text-[#059669]">
              {result.message}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-[#E7E5E4] px-4 py-2 text-sm text-[#78716C] hover:bg-[#F5F5F4]"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!file || !detectedType || uploading}
              className="rounded-lg bg-[#1C1917] px-4 py-2 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {uploading ? "上传中…" : "上传"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
