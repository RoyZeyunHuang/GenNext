"use client";

import { useState, useCallback, useEffect } from "react";
import { Upload, FileText, Trash2 } from "lucide-react";
import { deleteDocument } from "@/app/documents/actions";
import { extractTextFromFile } from "@/lib/extractFileText";
import type { DocumentRow } from "@/types/documents";
import { DOCUMENT_TYPES } from "@/types/documents";
import { cn } from "@/lib/utils";

const LIST_FETCH_TIMEOUT_MS = 10000;

async function fetchDocuments(): Promise<DocumentRow[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LIST_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("/api/documents", {
      signal: controller.signal,
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));
    console.log("[档案库] GET /api/documents 响应:", res.status, "ok:", res.ok, "data 类型:", Array.isArray(data) ? "array" : typeof data, "条数:", Array.isArray(data) ? data.length : "-");
    if (!res.ok) {
      const msg = typeof data?.error === "string" ? data.error : "获取列表失败";
      throw new Error(msg);
    }
    const list = Array.isArray(data) ? data : [];
    console.log("[档案库] 解析后列表条数:", list.length, list.length > 0 ? "首条:" + JSON.stringify(list[0]?.name ?? list[0]?.id) : "");
    return list;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("请求超时，请检查网络或 Supabase 配置");
    }
    throw e;
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DocumentsClient({ initialList }: { initialList: DocumentRow[] }) {
  const [list, setList] = useState<DocumentRow[]>(initialList);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [type, setType] = useState<string>(DOCUMENT_TYPES[0]);

  useEffect(() => {
    setLoadingList(true);
    setListError(null);
    fetchDocuments()
      .then((next) => {
        console.log("[档案库] 设置列表 state 条数:", next.length);
        setList(next);
        setListError(null);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "列表加载失败";
        console.error("[档案库] 列表加载失败:", msg, e);
        setListError(msg);
      })
      .finally(() => setLoadingList(false));
  }, []);

  const refreshList = useCallback(async () => {
    setListError(null);
    try {
      const next = await fetchDocuments();
      setList(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "列表加载失败";
      setListError(msg);
    }
  }, []);

  const upload = useCallback(
    async (file: File) => {
      const allowed =
        file.type === "application/pdf" ||
        file.type === "text/plain" ||
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      if (!allowed) {
        setError("仅支持 PDF / TXT / DOCX");
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const content = await extractTextFromFile(file);
        const res = await fetch("/api/documents/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, type, content }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = typeof data?.error === "string" ? data.error : "保存失败";
          throw new Error(msg);
        }
        await refreshList();
      } catch (e) {
        const message = e instanceof Error ? e.message : "解析或保存失败";
        setError(message);
        console.error("[档案库] 上传失败:", e);
      } finally {
        setUploading(false);
      }
    },
    [type, refreshList]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) upload(file);
    },
    [upload]
  );
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) upload(file);
      e.target.value = "";
    },
    [upload]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("确定删除该档案？")) return;
      await deleteDocument(id);
      setList((prev) => prev.filter((d) => d.id !== id));
    },
    []
  );

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#1C1917]">
          类型
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {DOCUMENT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                type === t
                  ? "border-[#1C1917] bg-[#1C1917] text-white"
                  : "border-[#E7E5E4] bg-white text-[#78716C] hover:bg-[#F5F5F4]"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        {error && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="flex-1 font-medium">上传失败：{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 rounded px-2 py-1 text-red-600 hover:bg-red-100"
            >
              关闭
            </button>
          </div>
        )}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 transition-colors",
            dragging
              ? "border-[#1C1917] bg-[#F5F5F4]"
              : "border-[#E7E5E4] bg-[#FAFAF9] hover:border-[#78716C]"
          )}
        >
          <input
            type="file"
            accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onFileInput}
            disabled={uploading}
            className="absolute h-0 w-0 opacity-0"
            id="doc-upload"
          />
          <label
            htmlFor="doc-upload"
            className="flex cursor-pointer flex-col items-center gap-2 text-[#78716C]"
          >
            <Upload className="h-10 w-10" />
            <span className="text-sm">
              {uploading ? "上传中…" : "拖拽文件到此处，或点击上传"}
            </span>
            <span className="text-xs">支持 PDF、TXT、DOCX</span>
          </label>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-[#1C1917]">文件列表</h2>
        {listError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            列表加载失败：{listError}
            <span className="ml-2 text-red-600">
              （请检查 .env.local 中 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY，以及是否已执行 002_documents_copywriter.sql 建表）
            </span>
          </div>
        )}
        {loadingList && list.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center text-sm text-[#78716C] shadow-card">
            加载中…
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center text-sm text-[#78716C] shadow-card">
            暂无档案，请先上传
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((doc) => (
              <div
                key={doc.id}
                className="flex items-start justify-between gap-2 rounded-lg bg-white p-4 shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-[#78716C]" />
                    <span className="truncate text-sm font-medium text-[#1C1917]">
                      {doc.name || "未命名"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {doc.type && (
                      <span className="rounded bg-[#F5F5F4] px-1.5 py-0.5 text-xs text-[#78716C]">
                        {doc.type}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[#78716C]">{formatDate(doc.created_at)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(doc.id)}
                  className="shrink-0 rounded p-1.5 text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]"
                  title="删除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
