"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, X, Trash2 } from "lucide-react";

const TYPES = ["news", "data", "report", "other"] as const;
const TYPE_LABELS: Record<string, string> = { news: "新闻", data: "数据", report: "报告", other: "其他" };

interface KnowledgeDoc {
  id: string;
  title: string;
  content: string | null;
  type: string | null;
  tags: string[];
  source_url: string | null;
  created_at: string;
}

export function KnowledgeDocsTab() {
  const [items, setItems] = useState<KnowledgeDoc[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<KnowledgeDoc | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({ title: "", content: "", type: "other", tags: "", source_url: "" });

  const fetchList = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/knowledge-docs?search=${encodeURIComponent(search)}`);
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", content: "", type: "other", tags: "", source_url: "" });
    setShowModal(true);
  };

  const openEdit = (item: KnowledgeDoc) => {
    setEditing(item);
    setForm({
      title: item.title,
      content: item.content || "",
      type: item.type || "other",
      tags: (item.tags || []).join(", "),
      source_url: item.source_url || "",
    });
    setShowModal(true);
  };

  const save = async () => {
    const payload = {
      title: form.title,
      content: form.content,
      type: form.type,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      source_url: form.source_url || null,
    };
    if (editing) {
      await fetch(`/api/knowledge-docs/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/knowledge-docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setShowModal(false);
    fetchList();
  };

  const remove = async (id: string) => {
    if (!confirm("确定删除？")) return;
    await fetch(`/api/knowledge-docs/${id}`, { method: "DELETE" });
    fetchList();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A29E]" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索知识库…" className="h-9 w-full rounded-lg border border-[#E7E5E4] bg-white pl-9 pr-3 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        </div>
        <button type="button" onClick={openNew} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white hover:bg-[#1C1917]/90">
          <Plus className="h-4 w-4" /> 新增
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[#78716C]">加载中…</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-sm text-[#78716C]">暂无知识库文档，点击右上角新增</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} onClick={() => openEdit(item)} className="group cursor-pointer rounded-lg border border-[#E7E5E4] bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium text-[#1C1917] line-clamp-1">{item.title}</h3>
                <button type="button" onClick={(e) => { e.stopPropagation(); remove(item.id); }} className="shrink-0 rounded p-1 text-[#A8A29E] opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {item.type && (
                <span className="mb-1.5 inline-block rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-600">{TYPE_LABELS[item.type] || item.type}</span>
              )}
              <p className="mb-2 text-xs text-[#78716C] line-clamp-2">{item.content || "暂无内容"}</p>
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <span key={tag} className="rounded bg-[#F5F5F4] px-1.5 py-0.5 text-xs text-[#78716C]">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-medium text-[#1C1917]">{editing ? "编辑知识库文档" : "新增知识库文档"}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">标题 *</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">类型</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20">
                  {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">内容</label>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={6} className="w-full resize-none rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">来源链接</label>
                <input type="text" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="https://..." className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">标签（逗号分隔）</label>
                <input type="text" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="市场, 数据, ..." className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)} className="h-9 rounded-lg border border-[#E7E5E4] px-4 text-sm text-[#78716C] hover:bg-[#F5F5F4]">取消</button>
              <button type="button" onClick={save} disabled={!form.title.trim()} className="h-9 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
