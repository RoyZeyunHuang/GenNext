"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatUserFacingError } from "@/lib/utils";
import {
  Copy,
  Crown,
  LogOut,
  Plus,
  RefreshCw,
  Shield,
  Trophy,
  UserMinus,
  Users,
  BookOpen,
  Share2,
} from "lucide-react";

/* ─── Types ─── */
type Team = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  my_role: string;
  joined_at: string;
};

type TeamMember = {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  email?: string;
};

type TeamDetail = {
  team: { id: string; name: string; invite_code: string; created_by: string };
  members: TeamMember[];
  my_role: string;
};

type LeaderboardEntry = {
  user_id: string;
  email: string;
  total_points: number;
  breakdown: Record<string, number>;
};

type TeamDoc = {
  id: string;
  title: string;
  content: string | null;
  category_id: string;
  owner_id: string | null;
  team_id: string;
  updated_at: string;
  tags: string[];
};

/* ─── Helpers ─── */
const roleLabel: Record<string, string> = { owner: "创建者", admin: "管理员", member: "成员" };
const RoleIcon = ({ role }: { role: string }) =>
  role === "owner" ? (
    <Crown className="h-3.5 w-3.5 text-amber-500" />
  ) : role === "admin" ? (
    <Shield className="h-3.5 w-3.5 text-blue-500" />
  ) : null;

const actionLabel: Record<string, string> = {
  doc_create: "创建文档",
  doc_edit: "编辑文档",
  doc_share: "分享文档",
  generation: "AI 生成",
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* Landing — no team yet                         */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function NoTeamView({ onCreated }: { onCreated: () => void }) {
  const [mode, setMode] = useState<"idle" | "create" | "join">("idle");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTeam = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(formatUserFacingError(d));
        return;
      }
      onCreated();
    } catch {
      setError("创建失败");
    } finally {
      setLoading(false);
    }
  };

  const joinTeam = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/teams/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: code.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(formatUserFacingError(d));
        return;
      }
      onCreated();
    } catch {
      setError("加入失败");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "h-11 w-full rounded-xl border border-[#E7E5E4] bg-white px-3.5 text-sm text-[#1C1917] shadow-sm outline-none placeholder:text-[#A8A29E] focus:border-[#D6D3D1] focus:ring-2 focus:ring-[#1C1917]/15";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-16">
      <Users className="h-12 w-12 text-[#D6D3D1]" />
      <h2 className="text-lg font-semibold text-[#1C1917]">还没有加入团队</h2>

      {mode === "idle" && (
        <div className="flex gap-3">
          <button
            onClick={() => setMode("create")}
            className="rounded-xl bg-[#1C1917] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#292524]"
          >
            创建团队
          </button>
          <button
            onClick={() => setMode("join")}
            className="rounded-xl border border-[#E7E5E4] bg-white px-5 py-2.5 text-sm font-medium text-[#44403C] hover:bg-[#F5F5F4]"
          >
            加入团队
          </button>
        </div>
      )}

      {mode === "create" && (
        <div className="w-full max-w-xs space-y-3">
          <input
            className={inputClass}
            placeholder="团队名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createTeam()}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={createTeam}
              disabled={loading || !name.trim()}
              className="flex-1 rounded-xl bg-[#1C1917] py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "创建中…" : "创建"}
            </button>
            <button
              onClick={() => { setMode("idle"); setError(null); }}
              className="rounded-xl border border-[#E7E5E4] px-4 py-2.5 text-sm text-[#78716C]"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {mode === "join" && (
        <div className="w-full max-w-xs space-y-3">
          <input
            className={inputClass}
            placeholder="邀请码"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinTeam()}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={joinTeam}
              disabled={loading || !code.trim()}
              className="flex-1 rounded-xl bg-[#1C1917] py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "加入中…" : "加入"}
            </button>
            <button
              onClick={() => { setMode("idle"); setError(null); }}
              className="rounded-xl border border-[#E7E5E4] px-4 py-2.5 text-sm text-[#78716C]"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* Team Docs Tab                                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function TeamDocsTab({ teamId }: { teamId: string }) {
  const [docs, setDocs] = useState<TeamDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [personalDocs, setPersonalDocs] = useState<TeamDoc[]>([]);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/docs?team_id=${teamId}`);
    if (res.ok) setDocs(await res.json());
    setLoading(false);
  }, [teamId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const openShareModal = async () => {
    setShowShare(true);
    const res = await fetch("/api/docs");
    if (res.ok) {
      const all: TeamDoc[] = await res.json();
      setPersonalDocs(all.filter((d) => d.owner_id));
    }
  };

  const shareDoc = async (docId: string) => {
    setSharingId(docId);
    const res = await fetch(`/api/docs/${docId}/share-to-team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId }),
    });
    setSharingId(null);
    if (res.ok) {
      setShowShare(false);
      fetchDocs();
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-[#A8A29E]">加载中…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#44403C]">
          团队文档 <span className="font-normal text-[#A8A29E]">({docs.length})</span>
        </h3>
        <button
          onClick={openShareModal}
          className="flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-white px-3 py-1.5 text-xs font-medium text-[#44403C] hover:bg-[#F5F5F4]"
        >
          <Share2 className="h-3.5 w-3.5" />
          分享我的文档
        </button>
      </div>

      {docs.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#A8A29E]">
          还没有团队文档，分享一个吧
        </p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div
              key={d.id}
              className="rounded-xl border border-[#E7E5E4] bg-white px-4 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#1C1917]">{d.title}</p>
                  {d.content && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-[#78716C]">
                      {d.content.slice(0, 120)}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[10px] text-[#A8A29E]">
                  {new Date(d.updated_at).toLocaleDateString("zh-CN")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Share modal */}
      {showShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowShare(false)}>
          <div className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-sm font-semibold text-[#1C1917]">选择要分享到团队的文档</h3>
            {personalDocs.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#A8A29E]">没有可分享的个人文档</p>
            ) : (
              <div className="space-y-2">
                {personalDocs.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-lg border border-[#E7E5E4] px-3 py-2"
                  >
                    <span className="truncate text-sm text-[#1C1917]">{d.title}</span>
                    <button
                      onClick={() => shareDoc(d.id)}
                      disabled={sharingId === d.id}
                      className="shrink-0 rounded-lg bg-[#1C1917] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {sharingId === d.id ? "分享中…" : "分享"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowShare(false)}
              className="mt-4 w-full rounded-xl border border-[#E7E5E4] py-2 text-sm text-[#78716C]"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* Team Members Tab                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function TeamMembersTab({
  detail,
  onRefresh,
}: {
  detail: TeamDetail;
  onRefresh: () => void;
}) {
  const [inviteCopied, setInviteCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const isOwnerOrAdmin = ["owner", "admin"].includes(detail.my_role);

  const copyCode = () => {
    navigator.clipboard.writeText(detail.team.invite_code);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const refreshCode = async () => {
    setRefreshing(true);
    await fetch(`/api/teams/${detail.team.id}/refresh-code`, { method: "POST" });
    setRefreshing(false);
    onRefresh();
  };

  const removeMember = async (userId: string) => {
    setRemovingId(userId);
    await fetch(`/api/teams/${detail.team.id}/members/${userId}`, { method: "DELETE" });
    setRemovingId(null);
    onRefresh();
  };

  return (
    <div className="space-y-5">
      {/* Invite code */}
      <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF9] p-4">
        <p className="mb-2 text-xs font-semibold text-[#57534E]">邀请码</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-white px-3 py-2 font-mono text-sm text-[#1C1917] border border-[#E7E5E4]">
            {detail.team.invite_code}
          </code>
          <button onClick={copyCode} className="rounded-lg p-2 hover:bg-white" title="复制">
            <Copy className="h-4 w-4 text-[#78716C]" />
          </button>
          {isOwnerOrAdmin && (
            <button onClick={refreshCode} disabled={refreshing} className="rounded-lg p-2 hover:bg-white" title="刷新邀请码">
              <RefreshCw className={cn("h-4 w-4 text-[#78716C]", refreshing && "animate-spin")} />
            </button>
          )}
        </div>
        {inviteCopied && <p className="mt-1 text-xs text-emerald-600">已复制</p>}
      </div>

      {/* Members list */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-[#44403C]">
          成员 <span className="font-normal text-[#A8A29E]">({detail.members.length})</span>
        </h3>
        <div className="space-y-2">
          {detail.members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-xl border border-[#E7E5E4] bg-white px-4 py-3"
            >
              <div className="flex items-center gap-2.5">
                <RoleIcon role={m.role} />
                <div>
                  <p className="text-sm text-[#1C1917]">{m.email ?? "—"}</p>
                  <p className="text-[10px] text-[#A8A29E]">{roleLabel[m.role] ?? m.role}</p>
                </div>
              </div>
              {isOwnerOrAdmin && m.role !== "owner" && (
                <button
                  onClick={() => removeMember(m.user_id)}
                  disabled={removingId === m.user_id}
                  className="rounded-lg p-1.5 text-[#A8A29E] hover:bg-red-50 hover:text-red-500"
                  title="移除"
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* Team Contributions Tab                         */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function TeamContributionsTab({ teamId }: { teamId: string }) {
  const [period, setPeriod] = useState<"week" | "month" | "all">("week");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/teams/${teamId}/contributions?period=${period}`)
      .then((r) => r.json())
      .then((d) => setLeaderboard(d.leaderboard ?? []))
      .finally(() => setLoading(false));
  }, [teamId, period]);

  const maxPoints = leaderboard[0]?.total_points || 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#44403C]">贡献排行</h3>
        <div className="flex gap-1 rounded-lg border border-[#E7E5E4] bg-white p-0.5">
          {(["week", "month", "all"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition",
                period === p
                  ? "bg-[#1C1917] text-white"
                  : "text-[#78716C] hover:text-[#1C1917]"
              )}
            >
              {p === "week" ? "本周" : p === "month" ? "本月" : "总计"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-[#A8A29E]">加载中…</div>
      ) : leaderboard.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#A8A29E]">暂无贡献记录</p>
      ) : (
        <div className="space-y-2.5">
          {leaderboard.map((entry, i) => (
            <div
              key={entry.user_id}
              className="rounded-xl border border-[#E7E5E4] bg-white px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                      i === 0
                        ? "bg-amber-100 text-amber-700"
                        : i === 1
                          ? "bg-gray-100 text-gray-600"
                          : i === 2
                            ? "bg-orange-50 text-orange-600"
                            : "bg-[#F5F5F4] text-[#78716C]"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm text-[#1C1917]">{entry.email}</span>
                </div>
                <span className="text-sm font-semibold text-[#1C1917]">
                  {entry.total_points} 分
                </span>
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 rounded-full bg-[#F5F5F4]">
                <div
                  className="h-1.5 rounded-full bg-[#1C1917] transition-all"
                  style={{ width: `${(entry.total_points / maxPoints) * 100}%` }}
                />
              </div>
              {/* Breakdown */}
              <div className="mt-1.5 flex flex-wrap gap-2">
                {Object.entries(entry.breakdown).map(([action, pts]) => (
                  <span
                    key={action}
                    className="text-[10px] text-[#A8A29E]"
                  >
                    {actionLabel[action] ?? action} {pts}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* Main Team Page Client                          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export function TeamPageClient() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [tab, setTab] = useState<"docs" | "members" | "contributions">("docs");

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/teams");
    if (res.ok) {
      const data: Team[] = await res.json();
      setTeams(data);
      if (data.length > 0 && !selectedTeamId) {
        setSelectedTeamId(data[0].id);
      }
    }
    setLoading(false);
  }, [selectedTeamId]);

  const fetchDetail = useCallback(async () => {
    if (!selectedTeamId) return;
    const res = await fetch(`/api/teams/${selectedTeamId}`);
    if (res.ok) setDetail(await res.json());
  }, [selectedTeamId]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);
  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20 text-sm text-[#A8A29E]">
        加载中…
      </div>
    );
  }

  if (teams.length === 0) {
    return <NoTeamView onCreated={fetchTeams} />;
  }

  const currentTeam = teams.find((t) => t.id === selectedTeamId);

  return (
    <div className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
      {/* Team header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-[#78716C]" />
          {teams.length === 1 ? (
            <h1 className="text-lg font-bold text-[#1C1917]">{currentTeam?.name}</h1>
          ) : (
            <select
              value={selectedTeamId ?? ""}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="rounded-lg border border-[#E7E5E4] bg-white px-3 py-1.5 text-sm font-semibold text-[#1C1917]"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <span className="rounded-md bg-[#F5F5F4] px-2 py-0.5 text-[10px] font-medium text-[#78716C]">
            {roleLabel[currentTeam?.my_role ?? ""] ?? ""}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-xl border border-[#E7E5E4] bg-[#FAFAF9] p-1">
        {([
          { key: "docs" as const, icon: BookOpen, label: "文档" },
          { key: "members" as const, icon: Users, label: "成员" },
          { key: "contributions" as const, icon: Trophy, label: "贡献" },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition",
              tab === key
                ? "bg-white text-[#1C1917] shadow-sm"
                : "text-[#78716C] hover:text-[#44403C]"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {selectedTeamId && tab === "docs" && <TeamDocsTab teamId={selectedTeamId} />}
      {selectedTeamId && tab === "members" && detail && (
        <TeamMembersTab detail={detail} onRefresh={fetchDetail} />
      )}
      {selectedTeamId && tab === "contributions" && (
        <TeamContributionsTab teamId={selectedTeamId} />
      )}
    </div>
  );
}
