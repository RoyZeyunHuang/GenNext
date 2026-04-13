"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseBioFields, shortCareerLabel, storyExcerpt, cleanName, cleanAge, shortLocation } from "@/lib/persona-rag/parse-bio-fields";
import { PersonaAvatar } from "./PersonaAvatar";
import { PersonaCustomizeModal } from "./PersonaCustomizeModal";

type PersonaItem = {
  id: string;
  user_id: string;
  name: string;
  short_description: string | null;
  self_intro: string | null;
  bio_md: string;
  is_public: boolean;
  visibility?: string;
  source_persona_id?: string | null;
  generate_invocation_count?: number;
  created_at: string;
};

type ForkResult = {
  persona: {
    id: string;
    name: string;
    short_description: string;
    bio_md: string;
  };
  notes_copied: number;
};

/* ── Dossier field row ── */
function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-[11px] leading-relaxed">
      <span className="shrink-0 font-medium tracking-wide text-white/40">{label}</span>
      <span className="text-white/80">{value}</span>
    </div>
  );
}

export function SoulCustomizeClient() {
  const [personas, setPersonas] = useState<PersonaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [forkSource, setForkSource] = useState<PersonaItem | null>(null);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const refreshPersonas = useCallback(() => {
    setLoading(true);
    void fetch("/api/personas")
      .then((r) => r.json())
      .then((j: PersonaItem[] | { error?: string }) => {
        if (Array.isArray(j)) setPersonas(j);
      })
      .catch(() => setPersonas([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshPersonas();
  }, [refreshPersonas]);

  useEffect(() => {
    void fetch("/api/rf/me")
      .then((r) => r.json())
      .then((j: { userId?: string | null }) => {
        setCurrentUserId(j.userId ?? null);
      })
      .catch(() => setCurrentUserId(null));
  }, []);

  const myPersonas = useMemo(
    () =>
      currentUserId
        ? personas.filter((p) => p.user_id === currentUserId)
        : personas.filter((p) => p.user_id === currentUserId || (!p.is_public && p.visibility === "private")),
    [personas, currentUserId]
  );

  const templatePersonas = useMemo(
    () =>
      currentUserId
        ? personas.filter((p) => p.user_id !== currentUserId)
        : [],
    [personas, currentUserId]
  );

  const handleForkCreated = (result: ForkResult) => {
    setForkSource(null);
    setJustCreatedId(result.persona.id);
    refreshPersonas();
    setTimeout(() => setJustCreatedId(null), 4000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这个人设吗？删除后不可恢复。")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/personas/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      refreshPersonas();
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-[100dvh] flex-1 bg-[#08070A] lg:min-h-0">
      {/* ── Hero header ── */}
      <header className="relative overflow-hidden border-b border-white/[0.04] px-5 pb-6 pt-5 lg:px-10 lg:pb-8 lg:pt-7">
        {/* radial glow */}
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-amber-500/[0.04] blur-[120px]" />
        {/* grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative">
          <p className="text-[9px] font-semibold uppercase tracking-[0.4em] text-amber-400/40">
            Soul Archive
          </p>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-white lg:text-3xl">
            灵魂档案
          </h1>
          <p className="mt-1.5 max-w-lg text-[12px] leading-relaxed text-white/40">
            每一份档案都是一个完整的灵魂。选择一份，注入你的风格，定制成专属于你的人设。
          </p>
        </div>
      </header>

      {/* ── My personas (shown first) ── */}
      <section className="px-4 pt-5 lg:px-10">
        <div className="mb-4 flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/20">
            我的灵魂
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" />
          {myPersonas.length > 0 && (
            <span className="text-[10px] tabular-nums text-white/20">
              {myPersonas.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-white/15" />
          </div>
        ) : myPersonas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.06] px-6 py-14 text-center">
            <p className="text-sm text-white/25">你还没有定制过灵魂</p>
            {templatePersonas.length > 0 && !showTemplates && (
              <button
                type="button"
                disabled
                className="mt-4 inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-5 py-2 text-[12px] font-medium text-white/25"
              >
                <Sparkles className="h-3.5 w-3.5" />
                即将上线
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {myPersonas.map((p) => {
              const isJustCreated = justCreatedId === p.id;
              const isDeleting = deletingId === p.id;
              const fields = parseBioFields(p.bio_md ?? "");
              return (
                <div
                  key={p.id}
                  className={cn(
                    "relative flex items-center gap-4 rounded-xl border bg-gradient-to-r from-[#16141A] to-[#0F0E12] px-5 py-4 transition-all duration-300 lg:px-6",
                    isJustCreated
                      ? "border-emerald-500/40 shadow-[0_0_24px_rgba(16,185,129,0.08)]"
                      : "border-white/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
                  )}
                >
                  {isJustCreated && (
                    <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      <Check className="h-3 w-3" />
                      定制成功
                    </span>
                  )}
                  <PersonaAvatar name={p.name} size={48} className="shrink-0 ring-1 ring-white/[0.08]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{p.name}</span>
                      {fields.career && (
                        <span className="truncate text-[10px] text-white/20">{shortCareerLabel(fields.career)}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-white/30">已生成 {p.generate_invocation_count ?? 0} 篇</p>
                  </div>
                  <a
                    href="/rednote-factory/copywriter-rag"
                    className="flex shrink-0 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium text-white/40 transition hover:border-amber-400/30 hover:bg-amber-400/10 hover:text-amber-300"
                  >
                    <Sparkles className="h-3 w-3" />
                    去创作
                  </a>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => void handleDelete(p.id)}
                    className="shrink-0 rounded-lg p-1.5 text-white/15 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                    title="删除"
                  >
                    {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              );
            })}
            {/* CTA to add more */}
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.06] py-3 text-[11px] text-white/20"
            >
              定制更多灵魂 · 即将上线
            </button>
          </div>
        )}
      </section>

      {/* ── Template dossier cards (shown on demand) ── */}
      {templatePersonas.length > 0 && showTemplates && (
        <section className="px-4 pt-6 lg:px-10">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/20">
              选择档案模版
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" />
          </div>
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2 lg:gap-4">
            {templatePersonas.map((p) => {
              const fields = parseBioFields(p.bio_md ?? "");
              const story = storyExcerpt(fields.story, 80);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "group relative cursor-not-allowed overflow-hidden rounded-xl text-left opacity-60",
                    "border border-white/[0.07] bg-gradient-to-b from-[#16141A] to-[#0F0E12]",
                    "shadow-[0_2px_20px_rgba(0,0,0,0.4)]"
                  )}
                >
                  {/* left accent line */}
                  <div className="absolute left-0 top-0 h-full w-[2px] bg-gradient-to-b from-amber-400/30 via-amber-400/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                  {/* top bar */}
                  <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-1.5">
                    <span className="text-[8px] font-bold uppercase tracking-[0.25em] text-amber-400/25">
                      Classified
                    </span>
                    <span className="font-mono text-[8px] text-white/[0.12]">
                      NO.{p.id.slice(0, 6).toUpperCase()}
                    </span>
                  </div>

                  <div className="px-4 pb-4 pt-3 lg:px-5">
                    {/* Avatar + name + inline tags */}
                    <div className="flex items-center gap-3.5">
                      <div className="relative shrink-0">
                        <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-amber-400/20 to-transparent opacity-0 blur-sm transition-opacity duration-500 group-hover:opacity-100" />
                        <PersonaAvatar
                          name={p.name}
                          size={56}
                          className="relative ring-[1.5px] ring-white/[0.08]"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <h3 className="text-base font-bold tracking-tight text-white lg:text-lg">
                            {cleanName(fields.name) || p.name}
                          </h3>
                          <span className="text-[11px] text-white/50">{shortCareerLabel(fields.career)}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-white/30">
                          {[cleanAge(fields.age), fields.gender, shortLocation(fields.location)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>

                    {/* Story excerpt — 2 line clamp */}
                    {story && (
                      <p className="mt-3 line-clamp-2 border-t border-white/[0.04] pt-3 text-[11px] italic leading-[1.7] text-white/45">
                        &ldquo;{story}&rdquo;
                      </p>
                    )}

                    {/* CTA */}
                    <div className="mt-3 flex justify-end">
                      <span className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3.5 py-1.5 text-[10px] font-medium text-white/20">
                        即将上线
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* bottom spacing */}
      <div className="pb-8 lg:pb-10" />

      {/* Fork modal */}
      {forkSource && (
        <PersonaCustomizeModal
          source={{
            id: forkSource.id,
            name: forkSource.name,
            short_description: forkSource.short_description,
            bio_md: forkSource.bio_md ?? "",
          }}
          onClose={() => setForkSource(null)}
          onCreated={handleForkCreated}
        />
      )}
    </div>
  );
}
