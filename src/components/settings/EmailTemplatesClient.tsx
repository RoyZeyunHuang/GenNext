"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Loader2 } from "lucide-react";
import { cn, formatThrownError, formatUserFacingError } from "@/lib/utils";
import { applyTemplate } from "@/lib/email-helpers";
import {
  DEFAULT_SIGNATURE_SENDER_NAME,
  DEFAULT_SIGNATURE_TITLE_LINE,
} from "@/lib/email-signature-settings";
import { wrapEmailHtml } from "@/lib/email-template";

/** 与真实发信时相同的变量占位，便于预览效果 */
const PREVIEW_VARS: Record<string, string> = {
  company_name: "Sample Developer LLC",
  contact_name: "Alex",
  property_name: "The Journal",
  company_role: "Developer",
  neighborhood: "Jersey City",
};

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

  /** 与设置页「邮件署名」一致，用于预览 */
  const [sigPreview, setSigPreview] = useState<{
    senderName: string;
    signatureTitleLine: string;
    senderEmail: string;
  } | null>(null);

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

  const refreshSignaturePreview = useCallback(() => {
    fetch("/api/settings/email-signature")
      .then((r) => r.json())
      .then((d: {
        sender_name_resolved?: string;
        signature_title_line_resolved?: string;
        sender_email_hint?: string | null;
      }) => {
        if (!d?.sender_name_resolved) return;
        setSigPreview({
          senderName: d.sender_name_resolved,
          signatureTitleLine: d.signature_title_line_resolved ?? DEFAULT_SIGNATURE_TITLE_LINE,
          senderEmail: (d.sender_email_hint ?? "").trim() || "sender@example.com",
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshSignaturePreview();
  }, [refreshSignaturePreview]);

  useEffect(() => {
    if (modalOpen) refreshSignaturePreview();
  }, [modalOpen, refreshSignaturePreview]);

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
        if (!res.ok) throw new Error(formatUserFacingError(data, "保存失败"));
      } else {
        const res = await fetch("/api/email/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(formatUserFacingError(data, "保存失败"));
      }
      setModalOpen(false);
      await fetchTemplates();
    } catch (e) {
      alert(formatThrownError(e, "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("确定删除该邮件模板？")) return;
    const res = await fetch(`/api/email/templates/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) alert(formatUserFacingError(data, "删除失败"));
    else fetchTemplates();
  };

  const varHint = useMemo(
    () =>
      "变量：{{company_name}} {{contact_name}} {{property_name}} {{company_role}} {{neighborhood}} — 批量发信可选 INVO — Established / New Buildings 两套模版",
    []
  );

  const previewSubject = useMemo(
    () => applyTemplate(form.subject, PREVIEW_VARS),
    [form.subject]
  );

  const previewHtmlFull = useMemo(() => {
    const raw = form.body.trim();
    if (!raw) return "";
    const applied = applyTemplate(raw, PREVIEW_VARS);
    const s = sigPreview;
    return wrapEmailHtml(
      applied,
      undefined,
      undefined,
      PREVIEW_VARS.property_name,
      s?.senderName ?? DEFAULT_SIGNATURE_SENDER_NAME,
      s?.senderEmail ?? "sender@example.com",
      s?.signatureTitleLine ?? DEFAULT_SIGNATURE_TITLE_LINE
    );
  }, [form.body, sigPreview]);

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
            className="flex max-h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl lg:max-h-[85vh] lg:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-h-0 flex-1 flex-col border-[#E7E5E4] lg:border-r">
              <div className="flex shrink-0 items-center justify-between border-b border-[#E7E5E4] px-4 py-3">
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
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
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
                    rows={12}
                    className="w-full rounded-lg border border-[#E7E5E4] bg-white px-2 py-2 font-mono text-sm"
                  />
                </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-[#E7E5E4] px-4 py-3">
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

            <div className="flex w-full min-w-0 flex-col border-t border-[#E7E5E4] bg-[#FAFAF9] lg:w-[min(48%,400px)] lg:border-l lg:border-t-0">
              <div className="shrink-0 border-b border-[#E7E5E4] px-4 py-3">
                <p className="text-xs font-medium text-[#1C1917]">发送预览（HTML）</p>
                <p className="mt-0.5 text-[10px] leading-snug text-[#A8A29E]">
                  与 Resend 实际发信相同的 INVO 信纸；变量已用示例值替换。发件邮箱以部署环境为准。
                </p>
                <p className="mt-2 truncate text-xs text-[#57534E]" title={previewSubject}>
                  <span className="text-[#A8A29E]">主题</span> {previewSubject || "—"}
                </p>
              </div>
              <div className="min-h-0 flex-1 p-3">
                {previewHtmlFull ? (
                  <iframe
                    title="邮件 HTML 预览"
                    srcDoc={previewHtmlFull}
                    sandbox="allow-same-origin"
                    className="h-[min(58vh,420px)] w-full rounded-lg border border-[#E7E5E4] bg-white shadow-sm lg:h-[min(62vh,480px)]"
                  />
                ) : (
                  <div className="flex h-[min(58vh,420px)] items-center justify-center rounded-lg border border-dashed border-[#E7E5E4] bg-white text-sm text-[#A8A29E] lg:h-[min(62vh,480px)]">
                    输入正文后显示预览
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

