"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Mail,
  Send,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveContactName,
  resolveRecipientEmail,
  type CompanyWithContacts,
} from "@/lib/email-helpers";

type EmailRow = {
  id: string;
  direction: "sent" | "received" | string;
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  ai_summary: string | null;
  created_at: string;
  opened_at?: string | null;
  bounced_at?: string | null;
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  sent: { bg: "bg-[#E7E5E4]", text: "text-[#57534E]" },
  delivered: { bg: "bg-blue-100", text: "text-blue-800" },
  opened: { bg: "bg-emerald-100", text: "text-emerald-800" },
  bounced: { bg: "bg-red-100", text: "text-red-800" },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CompanyEmailSection({ company }: { company: CompanyWithContacts }) {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [aiReplyLoading, setAiReplyLoading] = useState(false);

  const defaultTo = useMemo(() => resolveRecipientEmail(company) ?? "", [company]);
  const firstPropertyId = useMemo(() => {
    return (
      (company as any)?.property_companies?.find((pc: any) => pc?.properties?.id)?.properties?.id ??
      (company as any)?.property_companies?.[0]?.properties?.id ??
      null
    );
  }, [company]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/email?company_id=${company.id}`);
    const data = await res.json().catch(() => []);
    setEmails(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [company.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openWrite = () => {
    setTo(defaultTo);
    setSubject("");
    setBody("");
    setComposeOpen(true);
  };

  const openAiReply = async () => {
    setAiReplyLoading(true);
    try {
      const res = await fetch("/api/ai/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: company.id }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error ?? "AI 生成回复失败");
      setTo(defaultTo);
      setSubject(data.subject ?? "");
      setBody(data.body ?? "");
      setComposeOpen(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAiReplyLoading(false);
    }
  };

  const send = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          body: body.trim(),
          company_id: company.id,
          property_id: firstPropertyId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error || "发送失败");
      setComposeOpen(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-6 border-t border-[#E7E5E4] pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium text-[#1C1917]">📧 邮件往来</h4>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openWrite}
            className="rounded-lg border border-[#E7E5E4] px-2 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4]"
          >
            写邮件
          </button>
          <button
            type="button"
            onClick={openAiReply}
            disabled={aiReplyLoading}
            className="flex items-center gap-1 rounded-lg border border-[#E7E5E4] px-2 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4] disabled:opacity-50"
          >
            {aiReplyLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            AI 生成回复
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-[#78716C]">加载邮件…</p>
      ) : emails.length === 0 ? (
        <p className="text-xs text-[#78716C]">暂无邮件记录</p>
      ) : (
        <ul className="space-y-2">
          {emails.map((e) => {
            const isSent = e.direction === "sent";
            const statusStyle = STATUS_STYLE[e.status ?? "sent"] ?? STATUS_STYLE.sent;
            return (
              <li
                key={e.id}
                className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9]"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  className="flex w-full items-start gap-2 px-2 py-1.5 text-left text-xs"
                >
                  <span className="shrink-0 mt-0.5 text-[#78716C]">
                    {e.direction === "sent" ? "→" : "←"}
                  </span>
                  <Mail className="h-3.5 w-3.5 shrink-0 text-[#A8A29E]" />
                  <span className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-[#1C1917]">
                        {e.subject || "（无主题）"}
                      </span>
                      {isSent && e.status && (
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                            statusStyle.bg,
                            statusStyle.text
                          )}
                        >
                          {e.status}
                        </span>
                      )}
                    </div>
                    {e.ai_summary ? (
                      <div className="mt-1 line-clamp-1 text-xs italic text-gray-500">
                        {e.ai_summary}
                      </div>
                    ) : null}
                    <div className="mt-1 text-[10px] text-[#A8A29E]">
                      {formatTime(e.created_at)}
                    </div>
                  </span>
                  {expandedId === e.id ? (
                    <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A8A29E]" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A8A29E]" />
                  )}
                </button>
                {expandedId === e.id ? (
                  <div className="border-t border-[#E7E5E4] px-2 py-2 text-xs whitespace-pre-wrap text-[#44403C]">
                    {e.body || "（无正文）"}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {composeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setComposeOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h5 className="mb-3 text-sm font-medium text-[#1C1917]">
              发送邮件 — {company.name}
            </h5>

            <div className="space-y-2">
              <div>
                <div className="mb-0.5 text-[10px] font-medium text-[#78716C]">
                  收件人
                </div>
                <input
                  value={to}
                  onChange={(ev) => setTo(ev.target.value)}
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] px-2 text-sm"
                  placeholder={resolveContactName(company)}
                />
              </div>
              <div>
                <div className="mb-0.5 text-[10px] font-medium text-[#78716C]">
                  主题
                </div>
                <input
                  value={subject}
                  onChange={(ev) => setSubject(ev.target.value)}
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] px-2 text-sm"
                />
              </div>
              <div>
                <div className="mb-0.5 text-[10px] font-medium text-[#78716C]">
                  正文
                </div>
                <textarea
                  value={body}
                  onChange={(ev) => setBody(ev.target.value)}
                  rows={10}
                  className="w-full rounded-lg border border-[#E7E5E4] px-2 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                className="rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-xs text-[#78716C]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="flex items-center gap-1 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                发送
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

