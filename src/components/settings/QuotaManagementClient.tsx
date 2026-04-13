"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type QuotaRequest = {
  id: string;
  user_id: string;
  email: string;
  reason: string;
  status: string;
  granted_at: string | null;
  created_at: string;
};

type AdminUser = {
  id: string;
  email: string;
};

export function QuotaManagementClient() {
  const [me, setMe] = useState<{ isAdmin: boolean } | null>(null);
  const [pendingRequests, setPendingRequests] = useState<QuotaRequest[]>([]);
  const [recentGrants, setRecentGrants] = useState<QuotaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual grant
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [manualUserId, setManualUserId] = useState("");
  const [manualGranting, setManualGranting] = useState(false);
  const [manualResult, setManualResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    void fetch("/api/rf/me")
      .then((r) => r.json())
      .then((j: { isAdmin?: boolean }) => setMe({ isAdmin: Boolean(j.isAdmin) }))
      .catch(() => setMe({ isAdmin: false }));
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/quota-requests");
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "加载失败");
      const all = Array.isArray(data) ? data as QuotaRequest[] : [];
      setPendingRequests(all.filter((r) => r.status === "pending"));
      setRecentGrants(all.filter((r) => r.status === "approved").slice(0, 10));
    } catch {
      setPendingRequests([]);
      setRecentGrants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (me?.isAdmin) {
      void fetchRequests();
      void fetch("/api/admin/users")
        .then((r) => r.json())
        .then((data: { id: string; email?: string }[]) => {
          if (Array.isArray(data)) {
            setAllUsers(data.map((u) => ({ id: u.id, email: u.email ?? "—" })));
          }
        })
        .catch(() => setAllUsers([]));
    }
  }, [me?.isAdmin, fetchRequests]);

  const handleApprove = async (requestId: string, userId: string) => {
    setGrantingId(requestId);
    setError(null);
    try {
      const res = await fetch("/api/admin/grant-quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "操作失败");
      setGrantSuccess(requestId);
      setTimeout(() => setGrantSuccess(null), 3000);
      void fetchRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setGrantingId(null);
    }
  };

  const handleManualGrant = async () => {
    if (!manualUserId || manualGranting) return;
    setManualGranting(true);
    setManualResult(null);
    try {
      const res = await fetch("/api/admin/grant-quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: manualUserId }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; email?: string; bonus?: number };
      if (!res.ok) throw new Error(data.error || "操作失败");
      setManualResult({ ok: true, msg: `已为 ${data.email ?? manualUserId} 增加 ${data.bonus ?? 15} 次` });
      void fetchRequests();
    } catch (e) {
      setManualResult({ ok: false, msg: e instanceof Error ? e.message : "操作失败" });
    } finally {
      setManualGranting(false);
    }
  };

  if (!me?.isAdmin) return null;

  return (
    <section className="mt-10 border-t border-[#E7E5E4] pt-8">
      <div className="mb-4 flex items-center gap-2">
        <Zap className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-semibold text-[#1C1917]">额外用量管理</h2>
      </div>
      <p className="mb-4 text-sm text-[#78716C]">
        用户每周黑魔法默认 15 次（UTC 周一重置）。批准申请或手动分配后，本周额度 +15 次。
      </p>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {/* Pending requests */}
      <div className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-[#44403C]">
          待审批申请
          {pendingRequests.length > 0 && (
            <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700">
              {pendingRequests.length}
            </span>
          )}
        </h3>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-[#78716C]">
            <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
          </div>
        ) : pendingRequests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#E7E5E4] px-4 py-4 text-center text-sm text-[#A8A29E]">
            暂无待审批的用量申请
          </p>
        ) : (
          <div className="space-y-2">
            {pendingRequests.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-lg border border-[#E7E5E4] bg-white px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#1C1917]">{r.email}</p>
                  {r.reason && <p className="mt-0.5 truncate text-xs text-[#78716C]">{r.reason}</p>}
                  <p className="mt-0.5 text-[10px] text-[#A8A29E]">
                    {new Date(r.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={grantingId === r.id}
                  onClick={() => void handleApprove(r.id, r.user_id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition",
                    grantSuccess === r.id
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-[#1C1917] text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
                  )}
                >
                  {grantingId === r.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : grantSuccess === r.id ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  {grantSuccess === r.id ? "已批准" : "+15 次"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual grant */}
      <div className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-[#44403C]">手动分配额度</h3>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <select
              value={manualUserId}
              onChange={(e) => setManualUserId(e.target.value)}
              className="w-full rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
            >
              <option value="">选择用户…</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!manualUserId || manualGranting}
            onClick={() => void handleManualGrant()}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-50"
          >
            {manualGranting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            +15 次
          </button>
        </div>
        {manualResult && (
          <p className={cn("mt-2 text-xs", manualResult.ok ? "text-emerald-600" : "text-red-600")}>
            {manualResult.msg}
          </p>
        )}
      </div>

      {/* Recent grants */}
      {recentGrants.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[#44403C]">最近批准</h3>
          <div className="overflow-x-auto rounded-lg border border-[#E7E5E4] bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E7E5E4] bg-[#FAFAF9] text-xs font-medium text-[#78716C]">
                  <th className="px-4 py-2">用户</th>
                  <th className="px-4 py-2">申请时间</th>
                  <th className="px-4 py-2">批准时间</th>
                </tr>
              </thead>
              <tbody>
                {recentGrants.map((r) => (
                  <tr key={r.id} className="border-b border-[#F5F5F4] last:border-0">
                    <td className="px-4 py-2 font-medium text-[#1C1917]">{r.email}</td>
                    <td className="px-4 py-2 text-[#78716C]">
                      {new Date(r.created_at).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-2 text-[#78716C]">
                      {r.granted_at ? new Date(r.granted_at).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
