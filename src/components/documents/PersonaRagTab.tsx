"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainAppModalPortal } from "@/components/MainAppModalPortal";
import { PersonaAvatar } from "@/components/persona/PersonaAvatar";

async function parseResponseJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.slice(0, 100).replace(/\s+/g, " ").trim();
    throw new Error(
      `接口返回非 JSON（HTTP ${res.status}），多半是 HTML 错误页。请查看开发服务器终端日志；` +
        `并确认已在 Supabase 执行迁移 033_persona_rag.sql。（${snippet ? `片段：${snippet}` : "空响应"}）`
    );
  }
}

function tryParseJsonRecord(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return {};
}

type PersonaRow = {
  id: string;
  user_id: string;
  name: string;
  short_description: string | null;
  bio_md: string;
  source_url: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

type RfMe = { userId: string; isAdmin: boolean; hasMainAccess: boolean } | null;

type NoteRow = {
  id: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export function PersonaRagTab({
  layoutVariant = "default",
  rfMe = null,
}: {
  layoutVariant?: "default" | "rednote";
  rfMe?: RfMe;
}) {
  const isRf = layoutVariant === "rednote";
  const [personas, setPersonas] = useState<PersonaRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"profile" | "notes">("profile");
  const [profileForm, setProfileForm] = useState({
    name: "",
    short_description: "",
    bio_md: "",
    is_public: false,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [generatingShortDesc, setGeneratingShortDesc] = useState(false);
  const [bulkGeneratingShortDesc, setBulkGeneratingShortDesc] = useState(false);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [reembedding, setReembedding] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualBody, setManualBody] = useState("");
  const [manualLikes, setManualLikes] = useState("");
  const [manualNickname, setManualNickname] = useState("");
  const [addingNotes, setAddingNotes] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [retrieveOpen, setRetrieveOpen] = useState(false);
  const [retrieveQuery, setRetrieveQuery] = useState("");
  const [retrieveLoading, setRetrieveLoading] = useState(false);
  const [retrieveResults, setRetrieveResults] = useState<{ id: string; title: string; similarity: number }[]>([]);

  const fetchPersonas = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/personas");
      const data = await parseResponseJson(res);
      if (!res.ok) {
        const err =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "加载失败";
        throw new Error(err);
      }
      setPersonas(Array.isArray(data) ? data : []);
    } catch {
      setPersonas([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void fetchPersonas();
  }, [fetchPersonas]);

  const selected = personas.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setProfileForm({ name: "", short_description: "", bio_md: "", is_public: false });
      setNotes([]);
      return;
    }
    setProfileForm({
      name: selected.name,
      short_description: selected.short_description ?? "",
      bio_md: selected.bio_md ?? "",
      is_public: Boolean(selected.is_public),
    });
  }, [selected]);

  const fetchNotes = useCallback(async (personaId: string) => {
    setLoadingNotes(true);
    try {
      const res = await fetch(`/api/personas/${personaId}/notes`);
      const data = await parseResponseJson(res);
      if (!res.ok) {
        const err =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "加载笔记失败";
        throw new Error(err);
      }
      setNotes(Array.isArray(data) ? data : []);
    } catch {
      setNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setNotes([]);
      return;
    }
    if (rightTab === "notes") void fetchNotes(selectedId);
  }, [selectedId, rightTab, fetchNotes]);

  const createPersona = async () => {
    const name = window.prompt("新人设名称（必填）");
    if (!name?.trim()) return;
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          short_description: "",
          bio_md: "",
        }),
      });
      const data = await parseResponseJson<{ id?: string; error?: string }>(res);
      if (!res.ok) {
        alert(data.error || "创建失败");
        return;
      }
      if (!data.id) {
        alert("创建失败：未返回 id");
        return;
      }
      await fetchPersonas();
      setSelectedId(data.id);
      setRightTab("profile");
    } catch (e) {
      alert(e instanceof Error ? e.message : "创建失败");
    }
  };

  const generateShortDescriptionAi = async () => {
    if (!selectedId || !profileForm.name.trim()) return;
    setGeneratingShortDesc(true);
    try {
      const res = await fetch("/api/ai/persona-short-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_id: selectedId,
          name: profileForm.name.trim(),
          bio_md: profileForm.bio_md,
        }),
      });
      const data = await parseResponseJson<{ short_description?: string; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "生成失败");
      const line = typeof data.short_description === "string" ? data.short_description.trim() : "";
      if (!line) throw new Error("未返回简介");
      setProfileForm((f) => ({ ...f, short_description: line }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGeneratingShortDesc(false);
    }
  };

  const generateAllShortDescriptionsAi = async () => {
    if (personas.length === 0) return;
    if (
      !confirm(
        "将根据每个灵魂的「名字 + 完整角色档案」用 AI 重写一句话简介，并直接保存到数据库。人数较多时可能需要几十秒，确定继续？"
      )
    ) {
      return;
    }
    setBulkGeneratingShortDesc(true);
    try {
      const res = await fetch("/api/ai/persona-short-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: true }),
      });
      const data = await parseResponseJson<{
        updated?: number;
        total?: number;
        errors?: string[];
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "批量生成失败");
      const errs = Array.isArray(data.errors) ? data.errors : [];
      alert(
        `已完成：${data.updated ?? 0} / ${data.total ?? 0} 个` +
          (errs.length ? `\n部分失败：\n${errs.slice(0, 5).join("\n")}` : "")
      );
      await fetchPersonas();
    } catch (e) {
      alert(e instanceof Error ? e.message : "批量生成失败");
    } finally {
      setBulkGeneratingShortDesc(false);
    }
  };

  /** rfMe 未加载时不锁定；加载后：主站/超管可改任意，否则仅本人人设可改 */
  const canEditSelected =
    !rfMe ||
    rfMe.hasMainAccess ||
    rfMe.isAdmin ||
    (selected ? selected.user_id === rfMe.userId : false);

  const saveProfile = async () => {
    if (!selectedId || !profileForm.name.trim()) return;
    setSavingProfile(true);
    try {
      const payload: Record<string, unknown> = {
        name: profileForm.name.trim(),
        short_description: profileForm.short_description.trim() || null,
        bio_md: profileForm.bio_md,
      };
      if (rfMe?.isAdmin) {
        payload.is_public = profileForm.is_public;
      }
      const res = await fetch(`/api/personas/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "保存失败");
      await fetchPersonas();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingProfile(false);
    }
  };

  const deletePersona = async () => {
    if (!selectedId || !selected) return;
    if (!confirm("确定删除？这会级联删除该人设下所有笔记")) return;
    const res = await fetch(`/api/personas/${selectedId}`, { method: "DELETE" });
    const delText = await res.text();
    if (!res.ok) {
      const j = tryParseJsonRecord(delText);
      alert(typeof j.error === "string" ? j.error : "删除失败");
      return;
    }
    setSelectedId(null);
    await fetchPersonas();
  };

  const onCsvFile = async (file: File | null) => {
    if (!file || !selectedId) return;
    setCsvUploading(true);
    try {
      const text = await file.text();
      const res = await fetch(`/api/personas/${selectedId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      let data: { error?: string; inserted?: number; rows?: unknown[] };
      try {
        data = await parseResponseJson(res);
      } catch (e) {
        alert(e instanceof Error ? e.message : "无法解析服务器响应");
        return;
      }
      if (!res.ok) {
        alert(typeof data.error === "string" && data.error ? data.error : `上传失败（HTTP ${res.status}）`);
        return;
      }
      const n =
        typeof data.inserted === "number"
          ? data.inserted
          : Array.isArray(data.rows)
            ? data.rows.length
            : 0;
      alert(`导入成功：已新增 ${n} 条笔记。`);
      await fetchNotes(selectedId);
      await fetchPersonas();
    } catch (e) {
      alert(e instanceof Error ? e.message : "读取或上传文件失败");
    } finally {
      setCsvUploading(false);
    }
  };

  const addManualNotes = async () => {
    if (!selectedId || !manualTitle.trim() || !manualBody.trim()) return;
    setAddingNotes(true);
    try {
      const metadata: Record<string, unknown> = {};
      const likesRaw = manualLikes.trim().replace(/,/g, "");
      if (likesRaw) {
        const n = Number(likesRaw);
        if (!Number.isNaN(n)) metadata.likes = n;
        else metadata.likes_raw = manualLikes.trim();
      }
      const nick = manualNickname.trim();
      if (nick) metadata.nickname = nick;
      const res = await fetch(`/api/personas/${selectedId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: [
            {
              title: manualTitle.trim(),
              body: manualBody.trim(),
              ...(Object.keys(metadata).length ? { metadata } : {}),
            },
          ],
        }),
      });
      const data = await parseResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "添加失败");
      alert("添加成功");
      setManualOpen(false);
      setManualTitle("");
      setManualBody("");
      setManualLikes("");
      setManualNickname("");
      await fetchNotes(selectedId);
      await fetchPersonas();
    } catch (e) {
      alert(e instanceof Error ? e.message : "添加失败");
    } finally {
      setAddingNotes(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!selectedId) return;
    if (!confirm("删除该条笔记？")) return;
    const res = await fetch(`/api/personas/${selectedId}/notes/${noteId}`, { method: "DELETE" });
    const nText = await res.text();
    if (!res.ok) {
      const j = tryParseJsonRecord(nText);
      alert(typeof j.error === "string" ? j.error : "删除失败");
      return;
    }
    await fetchNotes(selectedId);
    await fetchPersonas();
  };

  const reembedAll = async () => {
    if (!selectedId) return;
    setReembedding(true);
    try {
      const res = await fetch(`/api/personas/${selectedId}/notes/reembed`, { method: "POST" });
      const data = await parseResponseJson<{ error?: string; updated?: number }>(res);
      if (!res.ok) throw new Error(data.error || "重新嵌入失败");
      alert(`已更新 ${data.updated ?? 0} 条笔记的向量`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "重新嵌入失败");
    } finally {
      setReembedding(false);
    }
  };

  const dedupeNotes = async () => {
    if (!selectedId) return;
    if (
      !confirm(
        "将删除「标题+正文」完全重复（忽略多余空白）的笔记，仅保留每组里最早创建的一条。继续？"
      )
    ) {
      return;
    }
    setDeduping(true);
    try {
      const res = await fetch(`/api/personas/${selectedId}/notes/dedupe`, { method: "POST" });
      const data = await parseResponseJson<{ error?: string; deleted?: number }>(res);
      if (!res.ok) throw new Error(data.error || "去重失败");
      alert(data.deleted ? `已删除 ${data.deleted} 条重复笔记` : "没有重复笔记");
      await fetchNotes(selectedId);
      await fetchPersonas();
    } catch (e) {
      alert(e instanceof Error ? e.message : "去重失败");
    } finally {
      setDeduping(false);
    }
  };

  const runRetrieveTest = async () => {
    if (!selectedId || !retrieveQuery.trim()) return;
    setRetrieveLoading(true);
    setRetrieveResults([]);
    try {
      const res = await fetch(`/api/personas/${selectedId}/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: retrieveQuery.trim(), k: 3 }),
      });
      const data = await parseResponseJson<{ error?: string; matches?: unknown }>(res);
      if (!res.ok) throw new Error(data.error || "检索失败");
      const matches = Array.isArray(data.matches) ? data.matches : [];
      setRetrieveResults(
        matches.map((m: { id: string; title: string; similarity: number }) => ({
          id: m.id,
          title: m.title,
          similarity: m.similarity,
        }))
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "检索失败");
    } finally {
      setRetrieveLoading(false);
    }
  };

  const asideW = isRf ? "w-full lg:w-[260px]" : "w-[260px]";

  return (
    <div
      className={cn(
        "flex min-h-[480px] gap-4",
        isRf ? "min-h-0 flex-1 flex-col lg:flex-row" : "flex-col lg:flex-row"
      )}
    >
      <div
        className={cn(
          "shrink-0 rounded-lg border border-[#E7E5E4] bg-white",
          asideW,
          isRf ? "max-h-[40vh] overflow-hidden lg:max-h-none" : ""
        )}
      >
        <div className="space-y-2 border-b border-[#E7E5E4] p-2">
          <button
            type="button"
            onClick={() => void createPersona()}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[#E7E5E4] py-2 text-xs font-medium text-[#1C1917] hover:bg-[#FAFAF9]"
          >
            <Plus className="h-3.5 w-3.5" /> 新建人设
          </button>
          <button
            type="button"
            disabled={bulkGeneratingShortDesc || personas.length === 0}
            onClick={() => void generateAllShortDescriptionsAi()}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-[#E7E5E4] bg-[#FAFAF9] py-2 text-xs font-medium text-[#1C1917] hover:bg-[#F5F5F4] disabled:opacity-50"
          >
            {bulkGeneratingShortDesc ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            全部 AI 一句话简介
          </button>
        </div>
        <div className={cn("max-h-[360px] overflow-y-auto p-2", isRf && "max-h-[min(40vh,320px)] lg:max-h-[calc(100dvh-12rem)]")}>
          {loadingList ? (
            <div className="py-8 text-center text-xs text-[#78716C]">加载中…</div>
          ) : personas.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-[#A8A29E]">暂无人设</p>
          ) : (
            personas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedId(p.id);
                  setRightTab("profile");
                }}
                className={cn(
                  "mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm",
                  selectedId === p.id
                    ? "bg-[#1C1917] font-medium text-white"
                    : "text-[#1C1917] hover:bg-[#F5F5F4]"
                )}
              >
                <PersonaAvatar
                  name={p.name}
                  size={32}
                  className={cn(
                    selectedId === p.id ? "ring-2 ring-white/45" : "ring-black/[0.06]"
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.is_public && (
                  <span
                    className={cn(
                      "shrink-0 rounded px-1 py-0.5 text-[9px] font-medium",
                      selectedId === p.id ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-700"
                    )}
                  >
                    公开
                  </span>
                )}
                {p.short_description && (
                  <span
                    className={cn(
                      "hidden max-w-[80px] truncate text-[10px] lg:inline",
                      selectedId === p.id ? "text-white/80" : "text-[#A8A29E]"
                    )}
                  >
                    {p.short_description}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 rounded-lg border border-[#E7E5E4] bg-white">
        {!selectedId ? (
          <div className="p-10 text-center text-sm text-[#78716C]">请从左侧选择或新建人设</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7E5E4] px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                {selected && (
                  <PersonaAvatar name={selected.name} size={48} className="mt-0.5 ring-black/[0.08]" />
                )}
                <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-[#1C1917]">{selected?.name}</h2>
                {selected?.short_description && (
                  <p className="truncate text-xs text-[#78716C]">{selected.short_description}</p>
                )}
                </div>
              </div>
              <button
                type="button"
                disabled={!canEditSelected}
                onClick={() => void deletePersona()}
                className="shrink-0 rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                删除人设
              </button>
            </div>

            <div className="flex gap-1 border-b border-[#E7E5E4] px-3 pt-2">
              <button
                type="button"
                onClick={() => setRightTab("profile")}
                className={cn(
                  "rounded-t-md px-3 py-2 text-xs font-medium",
                  rightTab === "profile"
                    ? "bg-[#FAFAF9] text-[#1C1917]"
                    : "text-[#78716C] hover:bg-[#FAFAF9]"
                )}
              >
                角色档案
              </button>
              <button
                type="button"
                onClick={() => setRightTab("notes")}
                className={cn(
                  "rounded-t-md px-3 py-2 text-xs font-medium",
                  rightTab === "notes"
                    ? "bg-[#FAFAF9] text-[#1C1917]"
                    : "text-[#78716C] hover:bg-[#FAFAF9]"
                )}
              >
                笔记语料
              </button>
            </div>

            <div className="p-4">
              {rightTab === "profile" && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#78716C]">名字</label>
                    <input
                      type="text"
                      value={profileForm.name}
                      disabled={!canEditSelected}
                      onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20 disabled:bg-[#FAFAF9]"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="block text-xs font-medium text-[#78716C]">一句话简介</label>
                      <button
                        type="button"
                        disabled={generatingShortDesc || !profileForm.name.trim() || !canEditSelected}
                        onClick={() => void generateShortDescriptionAi()}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#E7E5E4] bg-white px-2 py-1 text-[11px] font-medium text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-50"
                        title="根据当前名字与完整角色档案，用 AI 生成第一人称一句简介（可先改档案再点）"
                      >
                        {generatingShortDesc ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        AI 生成
                      </button>
                    </div>
                    <input
                      type="text"
                      value={profileForm.short_description}
                      disabled={!canEditSelected}
                      onChange={(e) => setProfileForm((f) => ({ ...f, short_description: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20 disabled:bg-[#FAFAF9]"
                      placeholder="第一人称一句，含年龄、身份、性格、爱好等"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#78716C]">完整角色（Markdown）</label>
                    <textarea
                      value={profileForm.bio_md}
                      disabled={!canEditSelected}
                      onChange={(e) => setProfileForm((f) => ({ ...f, bio_md: e.target.value }))}
                      rows={14}
                      className="w-full resize-y rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20 disabled:bg-[#FAFAF9]"
                      placeholder="出生地、职业、生活小传、说话方式…"
                    />
                  </div>
                  {rfMe?.isAdmin && (
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-[#44403C]">
                      <input
                        type="checkbox"
                        checked={profileForm.is_public}
                        onChange={(e) =>
                          setProfileForm((f) => ({ ...f, is_public: e.target.checked }))
                        }
                        className="rounded border-[#E7E5E4] text-[#1C1917] accent-[#1C1917]"
                      />
                      <span>对副程序（Rednote Factory）公开 · RF 用户可见此人设</span>
                    </label>
                  )}
                  <button
                    type="button"
                    disabled={savingProfile || !profileForm.name.trim() || !canEditSelected}
                    onClick={() => void saveProfile()}
                    className="rounded-lg bg-[#1C1917] px-4 py-2 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
                  >
                    {savingProfile ? "保存中…" : "保存"}
                  </button>
                </div>
              )}

              {rightTab === "notes" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={reembedding || !canEditSelected}
                      onClick={() => void reembedAll()}
                      className="flex items-center gap-1 rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-50"
                    >
                      {reembedding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      重新嵌入所有笔记
                    </button>
                    <button
                      type="button"
                      disabled={deduping || !canEditSelected}
                      onClick={() => void dedupeNotes()}
                      className="flex items-center gap-1 rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-50"
                    >
                      {deduping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      清理重复笔记
                    </button>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-1 rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#FAFAF9]",
                        (csvUploading || !canEditSelected) && "pointer-events-none opacity-60"
                      )}
                    >
                      {csvUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {csvUploading ? "上传中…" : "上传 CSV"}
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        disabled={csvUploading || !canEditSelected}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          void onCsvFile(f ?? null);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!canEditSelected}
                      onClick={() => setManualOpen(true)}
                      className="rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#FAFAF9] disabled:opacity-50"
                    >
                      手动添加
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRetrieveOpen(true);
                        setRetrieveResults([]);
                      }}
                      className="flex items-center gap-1 rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#FAFAF9]"
                    >
                      <Search className="h-3.5 w-3.5" />
                      测试检索
                    </button>
                  </div>
                  <p className="text-[11px] text-[#A8A29E]">
                    CSV：表头须含「笔记标题」「笔记文案」，且每行两者都不能为空。可选列：「点赞数」或「点赞」、「发布时间」、「昵称」或「作者昵称」。点赞与昵称写入 metadata（不参与向量检索）。
                  </p>

                  {loadingNotes ? (
                    <div className="py-10 text-center text-sm text-[#78716C]">加载笔记…</div>
                  ) : notes.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[#A8A29E]">暂无笔记语料</p>
                  ) : (
                    <ul className="divide-y divide-[#E7E5E4] rounded-lg border border-[#E7E5E4]">
                      {notes.map((n) => {
                        const meta = n.metadata ?? {};
                        const likes =
                          typeof meta.likes === "number"
                            ? meta.likes
                            : typeof meta.likes_raw === "string"
                              ? meta.likes_raw
                              : null;
                        const published =
                          typeof meta.published_at === "string" ? meta.published_at : null;
                        const nickname =
                          typeof meta.nickname === "string" && meta.nickname.trim()
                            ? meta.nickname.trim()
                            : null;
                        return (
                        <li key={n.id} className="flex items-start gap-2 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[#1C1917]">{n.title}</p>
                            {(nickname || likes != null || published) && (
                              <p className="mt-0.5 text-[10px] text-[#A8A29E]">
                                {nickname ? <>昵称 {nickname}</> : null}
                                {nickname && (likes != null || published) ? " · " : null}
                                {likes != null ? <>👍 {likes}</> : null}
                                {likes != null && published ? " · " : null}
                                {published ? <>发布时间 {published}</> : null}
                              </p>
                            )}
                            <p className="line-clamp-2 text-xs text-[#78716C]">{n.body}</p>
                          </div>
                          <button
                            type="button"
                            disabled={!canEditSelected}
                            onClick={() => void deleteNote(n.id)}
                            className="shrink-0 rounded p-1 text-[#A8A29E] hover:bg-red-50 hover:text-red-600"
                            aria-label="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {manualOpen && (
        <MainAppModalPortal
          variant={isRf ? "fullscreen" : "main"}
          className="items-end justify-center sm:items-center"
          onBackdropClick={() => setManualOpen(false)}
        >
          <div className="max-h-[90vh] w-full max-w-md rounded-t-xl bg-white p-5 shadow-xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-semibold text-[#1C1917]">手动添加笔记</h3>
            <p className="mb-2 text-[11px] text-[#A8A29E]">笔记标题、笔记文案必填；点赞、昵称可选。</p>
            <div className="space-y-2">
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="笔记标题（必填）"
                className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm"
              />
              <textarea
                value={manualBody}
                onChange={(e) => setManualBody(e.target.value)}
                placeholder="笔记文案（必填）"
                rows={6}
                className="w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm"
              />
              <input
                type="text"
                inputMode="numeric"
                value={manualLikes}
                onChange={(e) => setManualLikes(e.target.value)}
                placeholder="点赞数（可选）"
                className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm"
              />
              <input
                type="text"
                value={manualNickname}
                onChange={(e) => setManualNickname(e.target.value)}
                placeholder="昵称（可选）"
                className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setManualOpen(false)} className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-xs">
                取消
              </button>
              <button
                type="button"
                disabled={addingNotes || !manualTitle.trim() || !manualBody.trim()}
                onClick={() => void addManualNotes()}
                className="rounded-lg bg-[#1C1917] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {addingNotes ? "提交中…" : "添加"}
              </button>
            </div>
          </div>
        </MainAppModalPortal>
      )}

      {retrieveOpen && (
        <MainAppModalPortal
          variant={isRf ? "fullscreen" : "main"}
          className="items-end justify-center sm:items-center"
          onBackdropClick={() => setRetrieveOpen(false)}
        >
          <div className="max-h-[90vh] w-full max-w-lg rounded-t-xl bg-white p-5 shadow-xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-semibold text-[#1C1917]">测试向量检索</h3>
            <input
              type="text"
              value={retrieveQuery}
              onChange={(e) => setRetrieveQuery(e.target.value)}
              placeholder="输入查询语句…"
              className="mb-3 h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm"
            />
            <button
              type="button"
              disabled={retrieveLoading || !retrieveQuery.trim()}
              onClick={() => void runRetrieveTest()}
              className="mb-4 rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {retrieveLoading ? "检索中…" : "检索 Top-3"}
            </button>
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {retrieveResults.map((r) => (
                <li key={r.id} className="rounded-md border border-[#E7E5E4] px-3 py-2">
                  <span className="font-medium text-[#1C1917]">{r.title}</span>
                  <span className="ml-2 text-xs text-[#78716C]">相似度 {r.similarity?.toFixed?.(4) ?? r.similarity}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setRetrieveOpen(false)}
              className="mt-4 w-full rounded-lg border border-[#E7E5E4] py-2 text-xs text-[#78716C]"
            >
              关闭
            </button>
          </div>
        </MainAppModalPortal>
      )}
    </div>
  );
}
