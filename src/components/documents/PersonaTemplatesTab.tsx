"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, X, Trash2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface PersonaTemplate {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  is_default: boolean;
  created_at: string;
}

export function PersonaTemplatesTab() {
  const [items, setItems] = useState<PersonaTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PersonaTemplate | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({ title: "", description: "", content: "", is_default: false });

  const fetchList = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/persona-templates?search=${encodeURIComponent(search)}`);
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", description: "", content: "", is_default: false });
    setShowModal(true);
  };

  const openEdit = (item: PersonaTemplate) => {
    setEditing(item);
    setForm({
      title: item.title,
      description: item.description || "",
      content: item.content || "",
      is_default: item.is_default,
    });
    setShowModal(true);
  };

  const save = async () => {
    const payload = { title: form.title, description: form.description, content: form.content, is_default: form.is_default };
    if (editing) {
      await fetch(`/api/persona-templates/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/persona-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setShowModal(false);
    fetchList();
  };

  const remove = async (id: string) => {
    if (!confirm("确定删除？")) return;
    await fetch(`/api/persona-templates/${id}`, { method: "DELETE" });
    fetchList();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A29E]" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索人格模板…" className="h-9 w-full rounded-lg border border-[#E7E5E4] bg-white pl-9 pr-3 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        </div>
        <button type="button" onClick={openNew} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white hover:bg-[#1C1917]/90">
          <Plus className="h-4 w-4" /> 新增
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[#78716C]">加载中…</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-sm text-[#78716C]">暂无人格模板，点击右上角新增</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} onClick={() => openEdit(item)} className="group cursor-pointer rounded-lg border border-[#E7E5E4] bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-medium text-[#1C1917] line-clamp-1">{item.title}</h3>
                  {item.is_default && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); remove(item.id); }} className="shrink-0 rounded p-1 text-[#A8A29E] opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {item.description && (
                <p className="mb-1.5 text-xs font-medium text-orange-600">{item.description}</p>
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
              <h3 className="text-base font-medium text-[#1C1917]">{editing ? "编辑人格模板" : "新增人格模板"}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">标题 *</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">简短描述（一句话风格概括）</label>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="例如：高冷、反向营销、爱答不理" className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">详细人格设定</label>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={6} className="w-full resize-none rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
              </div>
              <label className={cn("flex items-center gap-2 text-sm text-[#1C1917]")}>
                <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} className="rounded border-[#E7E5E4] text-[#1C1917] focus:ring-[#1C1917]/20" />
                设为默认人格
              </label>
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
