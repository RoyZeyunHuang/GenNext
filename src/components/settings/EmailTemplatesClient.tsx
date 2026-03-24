"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at?: string;
};

export function EmailTemplatesClient() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", subject: "", body: "" });
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/email/templates");
    const data = await res.json().catch(() => []);
    setTemplates(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const openNew = () => {
    setEditingId(null);
    setForm({ name: "", subject: "", body: "" });
    setModalOpen(true);
  };

  const openEdit = (t: EmailTemplate) => {
    setEditingId(t.id);
    setForm({ name: t.name, subject: t.subject, body: t.body });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/email/templates/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "保存失败");
      } else {
        const res = await fetch("/api/email/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "保存失败");
      }
      setModalOpen(false);
      await fetchTemplates();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("确定删除该邮件模板？")) return;
    const res = await fetch(`/api/email/templates/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) alert(data?.error ?? "删除失败");
    else fetchTemplates();
  };

  const varHint = useMemo(
    () =>
      "变量：{{company_name}} {{contact_name}} {{property_name}} {{company_role}} — 批量发信可选 INVO — Established / New Buildings 两套模版",
    []
  );

  return (
    <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[#1C1917]">邮件模板管理</h2>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1C1917]/90"
        >
          <Plus className="h-3.5 w-3.5" /> + 新增模板
        </button>
      </div>

      <div className="mt-1 text-xs text-[#A8A29E]">{varHint}</div>

      {loading ? (
        <p className="mt-4 text-sm text-[#78716C]">加载中…</p>
      ) : templates.length === 0 ? (
        <p className="mt-4 text-sm text-[#78716C]">暂无模板</p>
      ) : (
        <div className="mt-4 space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[#1C1917]">{t.name}</div>
                <div className="truncate text-xs text-[#78716C]">{t.subject}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(t)}
                  className="rounded p-1.5 text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]"
                  title="编辑"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="rounded p-1.5 text-[#78716C] hover:bg-red-50 hover:text-red-500"
                  title="删除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-[#1C1917]">
                {editingId ? "编辑邮件模板" : "新增邮件模板"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs font-medium text-[#78716C]">名称</div>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-[#78716C]">主题</div>
                <input
                  value={form.subject}
                  onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-[#78716C]">正文（支持变量）</div>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                  rows={10}
                  className="w-full rounded-lg border border-[#E7E5E4] bg-white px-2 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-[#E7E5E4] pt-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="h-9 rounded-lg border border-[#E7E5E4] px-4 text-xs text-[#78716C] hover:bg-[#F5F5F4]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !form.name.trim() || !form.subject.trim() || !form.body.trim()}
                className={cn(
                  "h-9 rounded-lg bg-[#1C1917] px-4 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50",
                  saving && "cursor-not-allowed"
                )}
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> 保存中…
                  </span>
                ) : (
                  "保存"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

