"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Action = "ask" | "overwrite" | "skip";

type PropertyConflict = {
  csv_name: string;
  csv_build_year?: string | null;
  db_id: string;
  db_build_year?: string | null;
  action: Action;
};

type ContactConflict = {
  email: string;
  csv_name?: string;
  csv_title?: string;
  db_name?: string;
  db_title?: string;
  db_id?: string;
  action: Action;
};

type ConflictsDoc = {
  properties: PropertyConflict[];
  contacts: ContactConflict[];
};

function fmt(v: string | null | undefined) {
  if (v == null || v === "") return "—";
  return String(v);
}

export function AdminConflictsClient() {
  const [data, setData] = useState<ConflictsDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/conflicts", { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = (await res.json()) as ConflictsDoc;
      setData({
        properties: Array.isArray(j.properties) ? j.properties : [],
        contacts: Array.isArray(j.contacts) ? j.contacts : [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    document.title = "冲突处理 | GenNext";
    return () => {
      document.title = "GenNext";
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const total = useMemo(() => {
    if (!data) return 0;
    return data.properties.length + data.contacts.length;
  }, [data]);

  const processed = useMemo(() => {
    if (!data) return 0;
    const p = data.properties.filter((x) => x.action !== "ask").length;
    const c = data.contacts.filter((x) => x.action !== "ask").length;
    return p + c;
  }, [data]);

  const unprocessed = useMemo(() => {
    if (!data) return 0;
    return data.properties.filter((x) => x.action === "ask").length +
      data.contacts.filter((x) => x.action === "ask").length;
  }, [data]);

  const setPropertyAction = (index: number, action: Action) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, properties: [...prev.properties] };
      next.properties[index] = { ...next.properties[index], action };
      return next;
    });
  };

  const setContactAction = (index: number, action: Action) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, contacts: [...prev.contacts] };
      next.contacts[index] = { ...next.contacts[index], action };
      return next;
    });
  };

  const applyAll = (action: "overwrite" | "skip") => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        properties: prev.properties.map((p) => ({ ...p, action })),
        contacts: prev.contacts.map((c) => ({ ...c, action })),
      };
    });
  };

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/conflicts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setToast("saved:已保存，运行 node scripts/import-contacts-v2.js --execute 执行导入");
    } catch (e) {
      setToast(`error:${e instanceof Error ? e.message : "保存失败"}`);
    } finally {
      setSaving(false);
    }
  };

  const btnBase =
    "rounded-lg px-3 py-2 text-sm font-medium transition-colors border";

  const btnSelected = "bg-[#1C1917] text-white border-[#1C1917]";
  const btnUnselected = "border-[#D6D3D1] bg-white text-[#57534E] hover:bg-stone-50";

  if (loading) {
    return (
      <div className="text-sm text-[#78716C]">加载中…</div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </div>
    );
  }

  const doc = data ?? { properties: [], contacts: [] };
  const propN = doc.properties.length;
  const contN = doc.contacts.length;

  return (
    <div className="pb-28">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#1C1917]">冲突处理</h1>
        <p className="mt-1 text-sm text-[#78716C]">
          {propN} 个楼盘冲突 · {contN} 个联系人冲突
        </p>
      </div>

      {toast && (
        <div
          className={cn(
            "fixed top-4 right-4 z-[60] max-w-md rounded-lg px-4 py-3 text-sm shadow-lg",
            toast.startsWith("saved:")
              ? "bg-[#1C1917] text-white"
              : "bg-red-600 text-white"
          )}
        >
          {toast.replace(/^(saved:|error:)/, "")}
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-[#1C1917]">楼盘冲突</h2>
        {propN === 0 ? (
          <p className="text-sm text-[#78716C]">暂无楼盘冲突</p>
        ) : (
          <div className="space-y-4">
            {doc.properties.map((row, i) => (
              <div
                key={`${row.db_id}-${row.csv_name}-${i}`}
                className="rounded-[8px] bg-white p-5 shadow-sm"
              >
                <p className="mb-4 font-medium text-[#1C1917]">{row.csv_name}</p>
                <div className="mb-4 overflow-x-auto">
                  <table className="w-full min-w-[280px] text-sm">
                    <thead>
                      <tr className="text-left text-[#78716C]">
                        <th className="pb-2 pr-4 font-medium">字段</th>
                        <th className="pb-2 pr-4 font-medium">数据库</th>
                        <th className="pb-2 font-medium">CSV</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-1.5 pr-4 align-top text-[#57534E]">build_year</td>
                        <td className="py-1.5 pr-4">
                          <span
                            className="inline-block rounded px-2 py-1 font-mono text-[#991B1B]"
                            style={{ backgroundColor: "#FEF2F2" }}
                          >
                            {fmt(row.db_build_year)}
                          </span>
                        </td>
                        <td className="py-1.5">
                          <span
                            className="inline-block rounded px-2 py-1 font-mono text-[#166534]"
                            style={{ backgroundColor: "#F0FDF4" }}
                          >
                            {fmt(row.csv_build_year)}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={cn(
                      btnBase,
                      row.action === "skip" ? btnSelected : btnUnselected
                    )}
                    onClick={() => setPropertyAction(i, "skip")}
                  >
                    用数据库的
                  </button>
                  <button
                    type="button"
                    className={cn(
                      btnBase,
                      row.action === "overwrite" ? btnSelected : btnUnselected
                    )}
                    onClick={() => setPropertyAction(i, "overwrite")}
                  >
                    用CSV的
                  </button>
                  <button
                    type="button"
                    className={cn(
                      btnBase,
                      row.action === "skip" ? btnSelected : btnUnselected
                    )}
                    onClick={() => setPropertyAction(i, "skip")}
                  >
                    跳过
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-[#1C1917]">联系人冲突</h2>
        {contN === 0 ? (
          <p className="text-sm text-[#78716C]">暂无联系人冲突</p>
        ) : (
          <div className="space-y-4">
            {doc.contacts.map((row, i) => (
              <div
                key={`${row.email}-${i}`}
                className="rounded-[8px] bg-white p-5 shadow-sm"
              >
                <p className="mb-4 font-medium text-[#1C1917]">{row.email}</p>
                <div className="mb-4 overflow-x-auto">
                  <table className="w-full min-w-[320px] text-sm">
                    <thead>
                      <tr className="text-left text-[#78716C]">
                        <th className="pb-2 pr-4 font-medium">字段</th>
                        <th className="pb-2 pr-4 font-medium">数据库</th>
                        <th className="pb-2 font-medium">CSV</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-1.5 pr-4 align-top text-[#57534E]">name</td>
                        <td className="py-1.5 pr-4">
                          <span
                            className="inline-block rounded px-2 py-1 text-[#991B1B]"
                            style={{ backgroundColor: "#FEF2F2" }}
                          >
                            {fmt(row.db_name)}
                          </span>
                        </td>
                        <td className="py-1.5">
                          <span
                            className="inline-block rounded px-2 py-1 text-[#166534]"
                            style={{ backgroundColor: "#F0FDF4" }}
                          >
                            {fmt(row.csv_name)}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pr-4 align-top text-[#57534E]">title</td>
                        <td className="py-1.5 pr-4">
                          <span
                            className="inline-block rounded px-2 py-1 text-[#991B1B]"
                            style={{ backgroundColor: "#FEF2F2" }}
                          >
                            {fmt(row.db_title)}
                          </span>
                        </td>
                        <td className="py-1.5">
                          <span
                            className="inline-block rounded px-2 py-1 text-[#166534]"
                            style={{ backgroundColor: "#F0FDF4" }}
                          >
                            {fmt(row.csv_title)}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={cn(
                      btnBase,
                      row.action === "skip" ? btnSelected : btnUnselected
                    )}
                    onClick={() => setContactAction(i, "skip")}
                  >
                    用数据库的
                  </button>
                  <button
                    type="button"
                    className={cn(
                      btnBase,
                      row.action === "overwrite" ? btnSelected : btnUnselected
                    )}
                    onClick={() => setContactAction(i, "overwrite")}
                  >
                    用CSV的
                  </button>
                  <button
                    type="button"
                    className={cn(
                      btnBase,
                      row.action === "skip" ? btnSelected : btnUnselected
                    )}
                    onClick={() => setContactAction(i, "skip")}
                  >
                    跳过
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div
        className="fixed bottom-0 left-56 right-0 z-40 border-t border-[#E7E5E4] bg-white/95 px-6 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-[#57534E]">
            <span>
              已处理 <strong className="text-[#1C1917]">{processed}</strong> / 共{" "}
              <strong className="text-[#1C1917]">{total}</strong> 个冲突
            </span>
            {unprocessed > 0 && (
              <span className="ml-3 text-amber-700">
                未处理：{unprocessed}（action 仍为 ask）
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={cn(btnBase, btnUnselected)}
              onClick={() => applyAll("overwrite")}
            >
              全部用CSV覆盖
            </button>
            <button
              type="button"
              className={cn(btnBase, btnUnselected)}
              onClick={() => applyAll("skip")}
            >
              全部跳过
            </button>
            <button
              type="button"
              disabled={saving || !data}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity",
                "bg-[#1C1917] hover:opacity-90 disabled:opacity-50"
              )}
              onClick={() => void save()}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
