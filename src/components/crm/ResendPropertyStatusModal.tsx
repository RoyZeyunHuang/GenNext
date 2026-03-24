"use client";

import { Fragment, useEffect, useState } from "react";
import { X, Loader2, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type EmailDetail = {
  email_row_id: string;
  resend_id: string;
  in_resend_api: boolean;
  resend_last_event: string | null;
  resend_subject: string | null;
  resend_created_at: string | null;
  db_status: string | null;
  to_email: string | null;
  classified: string;
  contact: { id: string; name: string; title: string | null } | null;
  contact_match: "property_company" | "global" | null;
};

type PropertyRow = {
  property_id: string;
  property_name: string;
  outcome: string;
  recipient_intro: string;
  has_bounce: boolean;
  has_delivered: boolean;
  send_count: number;
  emails: EmailDetail[];
};

type ApiOk = {
  ok: true;
  resend_total_in_api: number;
  db_sent_rows_with_resend_id: number;
  db_rows_missing_property_id: number;
  db_rows_resend_id_not_found_in_api: number;
  properties: PropertyRow[];
};

type SyncResult = {
  ok: true;
  updated: number;
  inserted: number;
  skipped_terminal: number;
  property_ids: string[];
};

export function ResendPropertyStatusModal({
  open,
  onClose,
  onSynced,
}: {
  open: boolean;
  onClose: () => void;
  /** 同步成功后回调（例如刷新 Outreach 列表） */
  onSynced?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiOk | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncOkMsg, setSyncOkMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      setExpanded(null);
      setSyncError(null);
      setSyncOkMsg(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/email/resend-property-status")
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
        if (!j?.ok) throw new Error(j?.error ?? "请求失败");
        if (!cancelled) setData(j as ApiOk);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const runSync = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncOkMsg(null);
    try {
      const res = await fetch("/api/email/resend-property-status", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as SyncResult & { error?: string };
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      if (!j?.ok) throw new Error("同步失败");
      setSyncOkMsg(
        `已同步：更新 ${j.updated} 条，新建 ${j.inserted} 条；已结案未改 ${j.skipped_terminal} 条。`
      );
      onSynced?.();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[#E7E5E4] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E7E5E4] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[#1C1917]">Resend 发信与送达</h3>
            <p className="mt-0.5 text-[10px] text-[#78716C]">
              按楼盘汇总库内已发邮件（含 resend_id）与 Resend API 的 last_event
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#78716C]">
              <Loader2 className="h-5 w-5 animate-spin" />
              正在拉取 Resend 与数据库…
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}
          {!loading && !error && data && (
            <>
              <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-[#57534E]">
                <span>
                  Resend 列表条数：<strong>{data.resend_total_in_api}</strong>
                </span>
                <span>
                  库内已发（有 resend_id）：<strong>{data.db_sent_rows_with_resend_id}</strong>
                </span>
                <span>
                  未绑楼盘：<strong>{data.db_rows_missing_property_id}</strong>
                </span>
                <span>
                  库有 id、Resend 已无记录：<strong>{data.db_rows_resend_id_not_found_in_api}</strong>
                </span>
              </div>

              {data.properties.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#78716C]">
                  暂无带楼盘且含 resend_id 的发出记录。
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[#E7E5E4]">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E7E5E4] bg-[#FAFAF9] text-[10px] font-medium uppercase text-[#78716C]">
                        <th className="p-2">楼盘</th>
                        <th className="p-2">结论</th>
                        <th className="p-2 w-16" title="仅当该盘每一封都是 bounce 时为「是」">
                          全退信
                        </th>
                        <th className="p-2 w-16" title="至少一封已成功送达">
                          已送达
                        </th>
                        <th className="p-2 w-12">封数</th>
                        <th className="p-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.properties.map((p) => (
                        <Fragment key={p.property_id}>
                          <tr className="border-b border-[#F5F5F4] hover:bg-[#FAFAF9]/80">
                            <td className="p-2 font-medium text-[#1C1917]">{p.property_name}</td>
                            <td className="p-2 text-[#57534E]">{p.outcome}</td>
                            <td className="p-2">
                              {p.has_bounce ? (
                                <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">是</span>
                              ) : (
                                <span className="text-[#A8A29E]">否</span>
                              )}
                            </td>
                            <td className="p-2">
                              {p.has_delivered ? (
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
                                  是
                                </span>
                              ) : (
                                <span className="text-[#A8A29E]">—</span>
                              )}
                            </td>
                            <td className="p-2 text-[#78716C]">{p.send_count}</td>
                            <td className="p-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpanded((x) => (x === p.property_id ? null : p.property_id))
                                }
                                className="text-[#78716C] hover:text-[#1C1917]"
                              >
                                {expanded === p.property_id ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            </td>
                          </tr>
                          {expanded === p.property_id && (
                            <tr className="bg-[#FAFAF9]">
                              <td colSpan={6} className="p-0">
                                <div className="border-t border-[#E7E5E4] p-3">
                                  <p className="mb-3 text-[11px] leading-relaxed text-[#44403C]">
                                    {p.recipient_intro}
                                  </p>
                                  <table className="w-full text-[11px]">
                                    <thead>
                                      <tr className="text-[#78716C]">
                                        <th className="pb-1 text-left font-medium">联系人（数据库）</th>
                                        <th className="pb-1 text-left font-medium">邮箱</th>
                                        <th className="pb-1 text-left font-medium">Resend last_event</th>
                                        <th className="pb-1 text-left font-medium">判定</th>
                                        <th className="pb-1 text-left font-medium">库 status</th>
                                        <th className="pb-1 text-left font-medium">API</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {p.emails.map((e) => (
                                        <tr key={e.email_row_id} className="border-t border-[#E7E5E4]/60">
                                          <td className="py-1.5 pr-2 align-top">
                                            {e.contact ? (
                                              <div>
                                                <span className="font-medium text-[#1C1917]">
                                                  {e.contact.name}
                                                </span>
                                                {e.contact.title ? (
                                                  <span className="text-[#78716C]"> · {e.contact.title}</span>
                                                ) : null}
                                                {e.contact_match && (
                                                  <span
                                                    className={cn(
                                                      "ml-1 rounded px-1 py-0.5 text-[9px]",
                                                      e.contact_match === "property_company" &&
                                                        "bg-indigo-100 text-indigo-800",
                                                      e.contact_match === "global" &&
                                                        "bg-[#E7E5E4] text-[#57534E]"
                                                    )}
                                                    title={
                                                      e.contact_match === "property_company"
                                                        ? "邮箱与楼盘关联公司下的联系人一致"
                                                        : "全库按邮箱匹配到联系人"
                                                    }
                                                  >
                                                    {e.contact_match === "property_company" ? "盘内" : "全库"}
                                                  </span>
                                                )}
                                              </div>
                                            ) : (
                                              <span className="text-amber-800">未匹配联系人</span>
                                            )}
                                          </td>
                                          <td className="py-1.5 pr-2 align-top break-all">
                                            {e.to_email ?? "—"}
                                          </td>
                                          <td className="py-1.5 pr-2 font-mono text-[10px]">
                                            {e.resend_last_event ?? "—"}
                                          </td>
                                          <td className="py-1.5 pr-2">
                                            <span
                                              className={cn(
                                                e.classified === "bounce" && "text-red-700",
                                                e.classified === "delivered" && "text-emerald-700",
                                                e.classified === "pending" && "text-amber-700"
                                              )}
                                            >
                                              {e.classified}
                                            </span>
                                          </td>
                                          <td className="py-1.5 pr-2">{e.db_status ?? "—"}</td>
                                          <td className="py-1.5">
                                            {e.in_resend_api ? (
                                              <span className="text-emerald-600">有</span>
                                            ) : (
                                              <span className="text-amber-600">无</span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {!loading && !error && data && (
          <div className="shrink-0 border-t border-[#E7E5E4] px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] leading-relaxed text-[#78716C]">
                将上表楼盘同步到 Outreach：阶段为 Email Pitched；仅当该盘<strong>全部为</strong> bounce 时 Deal
                Status 为 bounced，否则为 Active。
              </p>
              <button
                type="button"
                onClick={() => void runSync()}
                disabled={syncing || data.properties.length === 0}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-[#1C1917] px-3 py-2 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                同步到 Outreach
              </button>
            </div>
            {syncError && (
              <p className="mt-2 text-[11px] text-red-700">{syncError}</p>
            )}
            {syncOkMsg && (
              <p className="mt-2 text-[11px] text-emerald-800">{syncOkMsg}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
