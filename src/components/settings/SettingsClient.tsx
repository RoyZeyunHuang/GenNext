"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Pencil, Trash2, X, Loader2, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmailTemplatesClient } from "@/components/settings/EmailTemplatesClient";

const COLORS = ["#4a90d9", "#21c354", "#e67e22", "#9b59b6", "#e74c3c", "#1abc9c", "#f39c12", "#3498db"];

type Account = {
  id: string;
  name: string;
  platform: string;
  color: string | null;
  notes: string | null;
  source?: string;
};

export function SettingsClient() {
  const [mailStatus, setMailStatus] = useState<{
    gmail_authorized: boolean;
    gmail_email: string | null;
    sender_email?: string | null;
    resend_configured?: boolean;
  } | null>(null);
  const [mailLoading, setMailLoading] = useState(true);
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testCc, setTestCc] = useState("");
  const [testBcc, setTestBcc] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const tid = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(tid);
  }, [toast]);
  const [syncLoading, setSyncLoading] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", platform: "小红书", color: COLORS[0], notes: "" });

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    const res = await fetch(`/api/accounts${params}`);
    const data = await res.json();
    setAccounts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const fetchMailSettings = useCallback(async () => {
    setMailLoading(true);
    const res = await fetch("/api/settings/email");
    const data = await res.json();
    setMailStatus({
      gmail_authorized: Boolean(data.gmail_authorized),
      gmail_email: data.gmail_email ?? null,
      sender_email: data.sender_email ?? null,
      resend_configured: Boolean(data.resend_configured),
    });
    setMailLoading(false);
  }, []);

  useEffect(() => {
    fetchMailSettings();
  }, [fetchMailSettings]);

  const syncInbox = async () => {
    setSyncLoading(true);
    try {
      const res = await fetch("/api/email/sync", { method: "POST" });
      const data = await res.json();
      alert(
        data.error
          ? data.error
          : `同步完成：写入 ${data.synced ?? 0} 封，跳过 ${data.skipped ?? 0}`
      );
    } finally {
      setSyncLoading(false);
    }
  };

  const saveNew = async () => {
    if (!form.name.trim()) return;
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        platform: form.platform.trim() || "小红书",
        color: form.color,
        notes: form.notes.trim() || null,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "添加失败");
      return;
    }
    setForm({ name: "", platform: "小红书", color: COLORS[0], notes: "" });
    setAdding(false);
    fetchAccounts();
  };

  const updateAccount = async (id: string, updates: Partial<Account>) => {
    await fetch(`/api/accounts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setEditingId(null);
    fetchAccounts();
  };

  const deleteAccount = async (id: string) => {
    if (!confirm("确定删除该账号？")) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    fetchAccounts();
  };

  const setColor = (id: string | null, color: string) => {
    if (id) updateAccount(id, { color });
    else setForm((f) => ({ ...f, color }));
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[#1C1917]">
          <Mail className="h-5 w-5 text-[#78716C]" />
          邮件设置
        </h2>
        {mailLoading ? (
          <p className="text-sm text-[#78716C]">加载中…</p>
        ) : (
          <div className="space-y-4 text-sm">
            <div>
              <span className="text-[#78716C]">Gmail 授权状态：</span>
              {mailStatus?.gmail_authorized ? (
                <span className="ml-2 font-medium text-emerald-700">已授权 ✅</span>
              ) : (
                <span className="ml-2 font-medium text-[#78716C]">未授权</span>
              )}
            </div>
            {mailStatus?.gmail_email && (
              <div className="text-[#44403C]">
                已授权邮箱：<span className="font-medium">{mailStatus.gmail_email}</span>
              </div>
            )}
            <div className="text-[#44403C]">
              发件邮箱：
              <span className="font-medium">
                {mailStatus?.sender_email?.trim()
                  ? mailStatus.sender_email
                  : "（未配置 SENDER_EMAIL）"}
              </span>
            </div>
            <div className="text-[#44403C]">
              Resend API：
              {mailStatus?.resend_configured ? (
                <span className="ml-2 font-medium text-emerald-700">已配置 ✅</span>
              ) : (
                <span className="ml-2 font-medium text-amber-800">未配置 RESEND_API_KEY</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/api/auth/google"
                className="inline-flex items-center rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-medium text-white hover:bg-[#1C1917]/90"
              >
                授权 Gmail
              </a>
              <button
                type="button"
                onClick={syncInbox}
                disabled={syncLoading || !mailStatus?.gmail_authorized}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E7E5E4] px-4 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-50"
              >
                {syncLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                同步收件箱
              </button>
              <button
                type="button"
                onClick={() => {
                  setTestTo("");
                  setTestCc("");
                  setTestBcc("");
                  setTestOpen(true);
                }}
                disabled={
                  !mailStatus?.sender_email?.trim() || !mailStatus?.resend_configured
                }
                className="inline-flex items-center gap-1 rounded-lg border border-[#E7E5E4] px-4 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-50"
              >
                发送测试邮件
              </button>
            </div>
            <p className="text-xs text-[#A8A29E]">
              发信使用 Resend，需配置 <code className="rounded bg-[#F5F5F4] px-1">RESEND_API_KEY</code>{" "}
              与 <code className="rounded bg-[#F5F5F4] px-1">SENDER_EMAIL</code>（已在 Resend 验证的域名）。
              收件同步仍用下方 Gmail 授权。
            </p>
          </div>
        )}
        {testOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-xl border border-[#E7E5E4] bg-white p-4 shadow-lg">
              <h3 className="text-sm font-semibold text-[#1C1917]">发送测试邮件</h3>
              <p className="mt-1 text-xs text-[#78716C]">将发送到下方收件人邮箱</p>
              <input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="收件人邮箱"
                className="mt-3 h-10 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm"
              />
              <input
                value={testCc}
                onChange={(e) => setTestCc(e.target.value)}
                placeholder="Cc（可选，逗号分隔）"
                className="mt-2 h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm"
              />
              <input
                value={testBcc}
                onChange={(e) => setTestBcc(e.target.value)}
                placeholder="Bcc（可选）"
                className="mt-2 h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTestOpen(false)}
                  className="rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-xs text-[#78716C] hover:bg-[#F5F5F4]"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={testSending || !testTo.trim()}
                  onClick={async () => {
                    setTestSending(true);
                    try {
                      const res = await fetch("/api/email/send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          is_test: true,
                          to: testTo.trim(),
                          subject: "INVO Email Test",
                          body: "This is a test email from INVO Ops Hub.",
                          is_html: false,
                          cc: testCc.trim() || null,
                          bcc: testBcc.trim() || null,
                        }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok || data?.error) throw new Error(data?.error || "发送失败");
                      setToast("测试邮件已发送");
                      setTestOpen(false);
                    } catch (e) {
                      alert(e instanceof Error ? e.message : String(e));
                    } finally {
                      setTestSending(false);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {testSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  发送
                </button>
              </div>
            </div>
          </div>
        )}
        {toast && (
          <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-[#1C1917] px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        )}
      </div>

      <EmailTemplatesClient />

      <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
        <h2 className="text-base font-semibold text-[#1C1917] mb-4">账号管理</h2>
        <div className="mb-4 relative max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A29E]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索账号名称或备注…"
            className="h-9 w-full rounded-lg border border-[#E7E5E4] bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
          />
        </div>
        <div className="space-y-2">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex items-center gap-3 rounded-lg border border-[#E7E5E4] px-4 py-3"
            >
              <div className="flex items-center gap-1 shrink-0">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(acc.id, c)}
                    className={cn(
                      "h-5 w-5 rounded-full border-2 transition-opacity hover:opacity-90",
                      acc.color === c ? "border-[#1C1917]" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              {editingId === acc.id ? (
                <>
                  <div className="flex gap-1 shrink-0">
                    {COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))} className={cn("h-5 w-5 rounded-full border-2", form.color === c ? "border-[#1C1917]" : "border-transparent")} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="名称" className="h-8 w-28 rounded border border-[#E7E5E4] px-2 text-sm" />
                  <input value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))} placeholder="平台" className="h-8 w-24 rounded border border-[#E7E5E4] px-2 text-sm" />
                  <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="备注" className="h-8 flex-1 min-w-0 rounded border border-[#E7E5E4] px-2 text-sm" />
                  <button type="button" onClick={() => updateAccount(acc.id, { name: form.name.trim(), platform: form.platform.trim(), color: form.color, notes: form.notes.trim() || null })} className="text-sm text-[#1C1917] hover:underline">保存</button>
                  <button type="button" onClick={() => { setEditingId(null); setForm({ name: "", platform: "小红书", color: COLORS[0], notes: "" }); }} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"><X className="h-4 w-4" /></button>
                </>
              ) : (
                <>
                  <span className="font-medium text-[#1C1917] min-w-0 truncate">{acc.name}</span>
                  <span className="shrink-0 rounded bg-[#F5F5F4] px-2 py-0.5 text-xs text-[#78716C]">{acc.platform || "小红书"}</span>
                  <span className="flex-1 min-w-0 truncate text-sm text-[#78716C]">{acc.notes || "—"}</span>
                  {acc.source === "auto_import" && (
                    <span className="shrink-0 rounded bg-[#E0F2FE] px-2 py-0.5 text-xs text-[#0369A1]">自动导入</span>
                  )}
                  <button type="button" onClick={() => { setEditingId(acc.id); setForm({ name: acc.name, platform: acc.platform || "小红书", color: acc.color || COLORS[0], notes: acc.notes || "" }); }} className="rounded p-1.5 text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => deleteAccount(acc.id)} className="rounded p-1.5 text-[#78716C] hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </>
              )}
            </div>
          ))}
          {adding && (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-[#D6D3D1] px-4 py-3 bg-[#FAFAF9]">
              <div className="flex gap-1 shrink-0">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))} className={cn("h-5 w-5 rounded-full border-2", form.color === c ? "border-[#1C1917]" : "border-transparent")} style={{ backgroundColor: c }} />
                ))}
              </div>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="名称 *" className="h-8 w-28 rounded border border-[#E7E5E4] px-2 text-sm" />
              <input value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))} placeholder="平台" className="h-8 w-24 rounded border border-[#E7E5E4] px-2 text-sm" />
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="备注" className="h-8 flex-1 min-w-0 rounded border border-[#E7E5E4] px-2 text-sm" />
              <button type="button" onClick={saveNew} disabled={!form.name.trim()} className="h-8 rounded-lg bg-[#1C1917] px-3 text-sm text-white disabled:opacity-50">添加</button>
              <button type="button" onClick={() => { setAdding(false); setForm({ name: "", platform: "小红书", color: COLORS[0], notes: "" }); }} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"><X className="h-4 w-4" /></button>
            </div>
          )}
        </div>
        {loading ? (
          <p className="py-4 text-sm text-[#78716C]">加载中…</p>
        ) : !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-[#D6D3D1] py-2.5 px-4 text-sm text-[#78716C] hover:border-[#1C1917] hover:text-[#1C1917]"
          >
            <Plus className="h-4 w-4" /> 添加账号
          </button>
        )}
        {!loading && accounts.length === 0 && !adding && (
          <p className="py-4 text-sm text-[#78716C]">暂无账号，点击「添加账号」或从 KPI 投放数据导入后会自动同步</p>
        )}
      </div>
    </div>
  );
}
