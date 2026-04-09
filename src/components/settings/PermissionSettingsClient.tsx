"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Shield } from "lucide-react";
type AdminUserRow = {
  id: string;
  email: string | undefined;
  created_at: string | undefined;
  has_main_access: boolean;
  persona_generate_unlimited: boolean;
  is_rf_admin: boolean;
};

export function PermissionSettingsClient() {
  const [me, setMe] = useState<{ isAdmin: boolean } | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/rf/me")
      .then((r) => r.json())
      .then((j: { isAdmin?: boolean }) => {
        setMe({ isAdmin: Boolean(j.isAdmin) });
      })
      .catch(() => setMe({ isAdmin: false }));
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "加载失败");
      }
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (me?.isAdmin) void fetchUsers();
  }, [me?.isAdmin, fetchUsers]);

  const patchUserMeta = async (id: string, body: Record<string, boolean>) => {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "保存失败");
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                has_main_access: data.has_main_access === true,
                persona_generate_unlimited: data.persona_generate_unlimited === true,
              }
            : u
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingId(null);
    }
  };

  if (!me?.isAdmin) {
    return null;
  }

  return (
    <section className="mt-10 border-t border-[#E7E5E4] pt-8">
      <div className="mb-4 flex items-center gap-2">
        <Shield className="h-5 w-5 text-[#1C1917]" />
        <h2 className="text-lg font-semibold text-[#1C1917]">权限设置</h2>
      </div>
      <p className="mb-4 text-sm text-[#78716C]">
        仅超级管理员可见。主站入口（has_main_access）决定用户能否进入主站 Dashboard / 内容工厂等；副程序账号默认仅有 Rednote
        Factory。黑魔法生成默认每人每日 15 次（UTC 换日），勾选「黑魔法不限次」可关闭该限制。超管人设「对副程序公开」在内容工厂人设页单独设置。
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#78716C]">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载用户列表…
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E7E5E4] bg-white">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E4] bg-[#FAFAF9] text-xs font-medium text-[#78716C]">
                <th className="px-4 py-3">邮箱</th>
                <th className="px-4 py-3">注册时间</th>
                <th className="px-4 py-3">主站入口</th>
                <th className="px-4 py-3">黑魔法不限次</th>
                <th className="px-4 py-3">超管</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[#F5F5F4] last:border-0">
                  <td className="px-4 py-3 font-medium text-[#1C1917]">{u.email ?? "—"}</td>
                  <td className="px-4 py-3 text-[#78716C]">
                    {u.created_at
                      ? new Date(u.created_at).toLocaleString("zh-CN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={u.has_main_access}
                        disabled={savingId === u.id}
                        onChange={(e) =>
                          void patchUserMeta(u.id, { has_main_access: e.target.checked })
                        }
                        className="rounded border-[#E7E5E4] text-[#1C1917] accent-[#1C1917]"
                      />
                      {savingId === u.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#A8A29E]" />
                      ) : null}
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={u.persona_generate_unlimited}
                        disabled={savingId === u.id}
                        onChange={(e) =>
                          void patchUserMeta(u.id, {
                            persona_generate_unlimited: e.target.checked,
                          })
                        }
                        className="rounded border-[#E7E5E4] text-[#1C1917] accent-[#1C1917]"
                      />
                    </label>
                  </td>
                  <td className="px-4 py-3 text-[#78716C]">{u.is_rf_admin ? "是（环境变量）" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="px-4 py-3 text-sm text-[#A8A29E]">暂无用户</p>
          )}
        </div>
      )}
    </section>
  );
}
