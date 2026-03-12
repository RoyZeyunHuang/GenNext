"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, X, Trash2 } from "lucide-react";

const PLATFORMS = [
  { value: "xiaohongshu", label: "小红书" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "video", label: "视频脚本" },
  { value: "wechat", label: "微信" },
  { value: "other", label: "其他" },
] as const;

const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.value, p.label]));

interface TaskTemplate {
  id: string;
  title: string;
  platform: string | null;
  content: string | null;
  is_default: boolean;
  created_at: string;
}

export function TaskTemplatesTab() {
  const [items, setItems] = useState<TaskTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({ title: "", platform: "other", content: "", is_default: false });

  const fetchList = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/task-templates?search=${encodeURIComponent(search)}`);
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", platform: "other", content: "", is_default: false });
    setShowModal(true);
  };

  const openEdit = (item: TaskTemplate) => {
    setEditing(item);
    setForm({
      title: item.title,
      platform: item.platform || "other",
      content: item.content || "",
      is_default: item.is_default,
    });
    setShowModal(true);
  };

  const save = async () => {
    const payload = { title: form.title, platform: form.platform, content: form.content, is_default: form.is_default };
    if (editing) {
      await fetch(`/api/task-templates/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/task-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setShowModal(false);
    fetchList();
  };

  const remove = async (id: string) => {
    if (!confirm("确定删除？")) return;
    await fetch(`/api/task-templates/${id}`, { method: "DELETE" });
    fetchList();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A29E]" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索任务模板…" className="h-9 w-full rounded-lg border border-[#E7E5E4] bg-white pl-9 pr-3 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        </div>
        <button type="button" onClick={openNew} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white hover:bg-[#1C1917]/90">
          <Plus className="h-4 w-4" /> 新增
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[#78716C]">加载中…</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-sm text-[#78716C]">暂无任务模板，点击右上角新增</div>
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
              {item.platform && (
                <span className="mb-1.5 inline-block rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-600">{PLATFORM_LABELS[item.platform] || item.platform}</span>
              )}
              <p className="text-xs text-[#78716C] line-clamp-3">{item.content || "暂无内容"}</p>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-medium text-[#1C1917]">{editing ? "编辑任务模板" : "新增任务模板"}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">标题 *</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">平台</label>
                <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20">
                  {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">模板内容</label>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={6} className="w-full resize-none rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" placeholder="可使用 {{变量}} 占位符" />
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
