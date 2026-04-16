"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Copy, Loader2, ShieldAlert, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAiErrorForUser } from "@/lib/ai-user-facing-error";
import {
  ARTICLE_LENGTH_SEGMENTED,
  DEFAULT_ARTICLE_LENGTH,
  normalizeArticleLength,
  type ArticleLength,
} from "@/lib/copy-generate-options";
import {
  scanXhsForbidden,
  segmentsForHighlight,
  riskLevelMarkClass,
  riskLevelLabel,
  type ScanResult,
} from "@/lib/xhsForbiddenScan";
import { isTitlePatternCategoryRow, resolvePromptDocRole } from "@/lib/doc-category-constants";
import { PersonaAvatar } from "@/components/persona/PersonaAvatar";
import { FeedbackModal } from "@/components/feedback/FeedbackModal";

type Category = { id: string; name: string; icon: string; sort_order?: number };
type Doc = { id: string; title: string; category_id: string };
type PersonaOpt = { id: string; name: string; short_description: string | null; is_public?: boolean; visibility?: string; user_id?: string };

/** 三种内容形态——与后端 persona-rag/content-kind.ts 的 PersonaContentKind 一一对应 */
type ContentKind = "xiaohongshu" | "instagram" | "oral_script";
const CONTENT_KIND_OPTIONS: { value: ContentKind; emoji: string; label: string }[] = [
  { value: "xiaohongshu", emoji: "📕", label: "小红书笔记" },
  { value: "instagram", emoji: "📸", label: "Instagram" },
  { value: "oral_script", emoji: "🎙️", label: "口播稿" },
];

type PersonaQuota = {
  unlimited: boolean;
  used: number;
  limit: number;
  remaining: number | null;
};

type TitleVariant = { type_name: string; text: string };

function HighlightedForbiddenText({ text, scan }: { text: string; scan: ScanResult }) {
  const segs = segmentsForHighlight(text, scan.levelAt);
  return (
    <>
      {segs.map((s, i) => {
        const chunk = text.slice(s.start, s.end);
        if (!s.level) return <span key={i}>{chunk}</span>;
        return (
          <mark
            key={i}
            className={cn("rounded px-0.5", riskLevelMarkClass(s.level))}
            title={`风险：${riskLevelLabel(s.level)}`}
          >
            {chunk}
          </mark>
        );
      })}
    </>
  );
}

export function CopywriterClientRAG({
  layoutVariant = "default",
}: {
  layoutVariant?: "default" | "rednote";
}) {
  const isRf = layoutVariant === "rednote";
  const searchParams = useSearchParams();
  const [userInput, setUserInput] = useState("");
  const [personas, setPersonas] = useState<PersonaOpt[]>([]);
  const [personaId, setPersonaId] = useState<string>("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [allDocs, setAllDocs] = useState<Doc[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [taskDocId, setTaskDocId] = useState<string>("");
  const [knowledgeDocId, setKnowledgeDocId] = useState<string>("");
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  /** 内容形态（仅主站暴露 UI；RF 强制小红书） */
  const [contentKind, setContentKind] = useState<ContentKind>("xiaohongshu");
  const [articleLengthSelect, setArticleLengthSelect] = useState<ArticleLength>(DEFAULT_ARTICLE_LENGTH);
  /** 标题：未选择 | 默认模版（正文后 6 条纽约向标题） */
  const [titleSelect, setTitleSelect] = useState<string>("default");
  const [generating, setGenerating] = useState(false);
  const [generatingTitles, setGeneratingTitles] = useState(false);
  const [titleVariants, setTitleVariants] = useState<TitleVariant[]>([]);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [starred, setStarred] = useState(false);
  const [sensitiveScan, setSensitiveScan] = useState<ScanResult | null>(null);
  const [quota, setQuota] = useState<PersonaQuota | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [feedbackRequired, setFeedbackRequired] = useState(false);

  // Pre-fill from news feed (one-click generate)
  // 新方案：新闻详情 → 选写作角度 → 带 news_doc_id + prompt_key 跳过来
  // 旧方案（news_ref 直接塞全文）保留向后兼容
  useEffect(() => {
    const newsRef = searchParams.get("news_ref");
    const newsDocId = searchParams.get("news_doc_id");
    const promptKey = searchParams.get("prompt_key");

    if (newsDocId) {
      // 将在 docs 加载后的 useEffect 里绑定到 knowledgeDocId（见下）
      setMoreOptionsOpen(true);
    }
    if (promptKey) {
      const presets: Record<string, string> = {
        share: "写一篇分享以下新闻资讯的笔记",
        experience: "我参加了这个活动，写一篇笔记分享我的经历",
        market: "基于这条新闻写一篇给客户的市场观察/解读笔记",
      };
      const text = presets[promptKey];
      if (text) setUserInput(text);
    } else if (newsRef) {
      setUserInput(newsRef);
    }
  }, [searchParams]);

  // Prefill from /apartments → 黑魔法 handoff (sessionStorage preferred,
  // ?prefill= as fallback for private-mode browsers).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem("apartments_prefill");
    if (stored) {
      setUserInput(stored);
      window.sessionStorage.removeItem("apartments_prefill");
      return;
    }
    const q = searchParams.get("prefill");
    if (q) setUserInput(q);
  }, [searchParams]);

  // docs 加载完后，若 URL 带 news_doc_id，且该 doc 在拉到的列表里，预选到知识库下拉
  useEffect(() => {
    const newsDocId = searchParams.get("news_doc_id");
    if (!newsDocId) return;
    if (allDocs.length === 0) return;
    const match = allDocs.find((d) => d.id === newsDocId);
    if (match) {
      setKnowledgeDocId(newsDocId);
    }
  }, [searchParams, allDocs]);

  const refreshQuota = useCallback(() => {
    void fetch("/api/rf/me")
      .then((r) => r.json())
      .then(
        (j: {
          userId?: string | null;
          personaGenerateUnlimited?: boolean;
          personaGenerateUsed?: number;
          personaGenerateLimit?: number;
          personaGenerateRemaining?: number | null;
          feedbackRequired?: boolean;
        }) => {
          if (!j.userId) {
            setQuota(null);
            return;
          }
          setFeedbackRequired(Boolean(j.feedbackRequired));
          setCurrentUserId(j.userId);
          setQuota({
            unlimited: Boolean(j.personaGenerateUnlimited),
            used: typeof j.personaGenerateUsed === "number" ? j.personaGenerateUsed : 0,
            limit: typeof j.personaGenerateLimit === "number" ? j.personaGenerateLimit : 15,
            remaining:
              j.personaGenerateRemaining === null || j.personaGenerateRemaining === undefined
                ? null
                : j.personaGenerateRemaining,
          });
        }
      )
      .catch(() => setQuota(null));
  }, []);

  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

  useEffect(() => {
    void fetch("/api/personas")
      .then((r) => r.json())
      .then((j: PersonaOpt[] | { error?: string }) => {
        if (Array.isArray(j)) {
          setPersonas(j);
          if (j[0]?.id) setPersonaId(j[0].id);
        }
      })
      .catch(() => setPersonas([]));
  }, []);

  useEffect(() => {
    // Fetch personal/public docs and categories
    const base = Promise.all([
      fetch("/api/docs/categories").then((r) => r.json()),
      fetch("/api/docs").then((r) => r.json()),
    ]);
    // Also fetch user's team docs
    const teamFetch = fetch("/api/teams")
      .then((r) => (r.ok ? r.json() : []))
      .then(async (teams: { id: string; name: string }[]) => {
        if (!Array.isArray(teams) || teams.length === 0) return { teamDocs: [] as typeof allDocs, teamCats: [] as typeof categories, teamNames: {} as Record<string, string> };
        const teamNames: Record<string, string> = {};
        for (const t of teams) teamNames[t.id] = t.name;
        const results = await Promise.all(
          teams.map((t) =>
            Promise.all([
              fetch(`/api/docs/categories?team_id=${t.id}`).then((r) => r.json()),
              fetch(`/api/docs?team_id=${t.id}`).then((r) => r.json()),
            ]).then(([cats, docs]) => ({
              cats: Array.isArray(cats) ? cats : [],
              docs: Array.isArray(docs) ? docs : [],
            }))
          )
        );
        return {
          teamDocs: results.flatMap((r) => r.docs),
          teamCats: results.flatMap((r) => r.cats),
          teamNames,
        };
      })
      .catch(() => ({ teamDocs: [] as typeof allDocs, teamCats: [] as typeof categories, teamNames: {} as Record<string, string> }));

    Promise.all([base, teamFetch]).then(([[cats, docs], { teamDocs, teamCats, teamNames }]) => {
      setCategories(Array.isArray(cats) ? [...cats, ...teamCats] : teamCats);
      setAllDocs(Array.isArray(docs) ? [...docs, ...teamDocs] : teamDocs);
      setTeamNames(teamNames);
    });
  }, []);

  /** Personas grouped by access level for display */
  const privatePersonas = useMemo(
    () => (currentUserId ? personas.filter((p) => p.user_id === currentUserId) : []),
    [personas, currentUserId]
  );
  const publicPersonas = useMemo(
    () =>
      currentUserId
        ? personas.filter((p) => p.user_id !== currentUserId && (p.visibility === "public" || (!p.visibility && p.is_public)))
        : personas.filter((p) => p.visibility === "public" || (!p.visibility && p.is_public)),
    [personas, currentUserId]
  );

  const resolvedTitlePatternCategory = useMemo(
    () => categories.find((c) => isTitlePatternCategoryRow(c)),
    [categories]
  );

  const taskTemplateDocs = useMemo(() => {
    return allDocs.filter((d) => {
      const cat = categories.find((c) => c.id === d.category_id);
      if (!cat) return false;
      if (resolvedTitlePatternCategory && cat.id === resolvedTitlePatternCategory.id) return false;
      return resolvePromptDocRole(cat.name, undefined) === "format";
    });
  }, [allDocs, categories, resolvedTitlePatternCategory]);

  /** 内容工厂「知识」类文档（docs 表中 reference 角色，与主站文案知识源一致） */
  const zhiShiDocs = useMemo(() => {
    return allDocs.filter((d) => {
      const cat = categories.find((c) => c.id === d.category_id);
      if (!cat) return false;
      return resolvePromptDocRole(cat.name, undefined) === "reference";
    });
  }, [allDocs, categories]);

  const showOutputPanel =
    !isRf ||
    generating ||
    generatingTitles ||
    output.trim() !== "" ||
    titleError !== null ||
    titleVariants.length > 0;

  useEffect(() => {
    setSensitiveScan(null);
  }, [output]);

  const generate = async () => {
    if (!userInput.trim() || !personaId) {
      setError(!personaId ? "请选择人设" : "请填写创作提示");
      return;
    }
    setGenerating(true);
    setGeneratingTitles(false);
    setError(null);
    setTitleError(null);
    setTitleVariants([]);
    setOutput("");
    setStarred(false);
    setCopied(false);
    try {
      const articleLengthForApi = normalizeArticleLength(articleLengthSelect);
      const separateTitles = titleSelect === "default";

      const res = await fetch("/api/ai/persona-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_id: personaId,
          user_input: userInput,
          task_template_doc_id: taskDocId.trim() || undefined,
          knowledge_doc_id: knowledgeDocId.trim() || undefined,
          article_length: articleLengthForApi,
          separate_titles: separateTitles,
          content_kind: contentKind,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("无响应流");
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        if (buf.startsWith("ERROR: ")) {
          setError(formatAiErrorForUser(buf.slice(7)));
          setOutput("");
          return;
        }
        setOutput(buf);
      }

      const finalBody = buf.trim();
      if (separateTitles && finalBody) {
        setGeneratingTitles(true);
        try {
          const tr = await fetch("/api/ai/persona-generate-title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              persona_id: personaId,
              body_text: finalBody,
              user_input: userInput,
              content_kind: contentKind,
            }),
          });
          const data = (await tr.json().catch(() => ({}))) as {
            error?: string;
            titles?: TitleVariant[];
          };
          if (!tr.ok) {
            throw new Error(data.error || `标题生成失败 HTTP ${tr.status}`);
          }
          setTitleVariants(Array.isArray(data.titles) ? data.titles : []);
        } catch (te) {
          setTitleError(formatAiErrorForUser(te));
        } finally {
          setGeneratingTitles(false);
        }
      }
    } catch (e) {
      setError(formatAiErrorForUser(e));
    } finally {
      setGenerating(false);
      void refreshQuota();
    }
  };

  const copyToClipboard = async () => {
    if (!output.trim()) return;
    await navigator.clipboard.writeText(output.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStar = async () => {
    if (!output.trim() || starred) return;
    await fetch("/api/docs/star", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: userInput?.trim().slice(0, 60) || undefined,
        content: output.trim(),
        metadata: {
          user_input: userInput,
          persona_id: personaId,
          platform: "xiaohongshu",
        },
      }),
    });
    setStarred(true);
  };

  return (
    <div
      className={cn(
        "grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start",
        isRf && "px-4 pb-4 pt-2 lg:px-6 lg:pb-6 lg:pt-4"
      )}
    >
      {isRf && (
        <div className="col-span-full lg:col-span-2">
          <h1 className="text-[15px] font-bold text-[#1C1917] lg:text-lg">黑魔法笔记生成</h1>
        </div>
      )}
      <div className="space-y-4">
        <div className="rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm">
          <div className="mb-4 space-y-3">
            {/* 私人灵魂 */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A8A29E]">
                  我的灵魂
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-[#E7E5E4] to-transparent" aria-hidden />
              </div>
              {privatePersonas.length === 0 ? (
                <a
                  href="/rednote-factory/soul-customize"
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#E7E5E4] bg-[#FAFAF9] px-3 py-4 text-xs text-[#A8A29E] transition hover:border-[#D6D3D1] hover:text-[#78716C]"
                >
                  前往灵魂定制，打造专属人设 →
                </a>
              ) : (
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-1.5">
                  {privatePersonas.map((p) => {
                    const selected = personaId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPersonaId(p.id)}
                        className={cn(
                          "group relative min-w-0 rounded-xl border px-2 py-1.5 text-left transition-all duration-200",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1C1917]/25 focus-visible:ring-offset-1",
                          selected
                            ? "border-[#1C1917]/25 bg-gradient-to-br from-[#FAFAF9] via-white to-[#F5F5F4] shadow-sm ring-1 ring-[#1C1917]/10"
                            : "border-[#E7E5E4] bg-white hover:border-[#D6D3D1] hover:shadow-sm"
                        )}
                      >
                        {selected && (
                          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#1C1917] ring-1 ring-white" aria-hidden />
                        )}
                        <div className="flex gap-2.5 pr-3">
                          <PersonaAvatar name={p.name} size={44} className={selected ? "ring-2 ring-[#1C1917]/25" : undefined} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-semibold leading-tight tracking-tight text-[#1C1917]">{p.name}</div>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[#78716C]">{p.short_description?.trim() || "—"}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 公共灵魂 */}
            {publicPersonas.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A8A29E]">
                    公共灵魂
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-[#E7E5E4] to-transparent" aria-hidden />
                </div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-1.5">
                  {publicPersonas.map((p) => {
                    const selected = personaId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPersonaId(p.id)}
                        className={cn(
                          "group relative min-w-0 rounded-xl border px-2 py-1.5 text-left transition-all duration-200",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1C1917]/25 focus-visible:ring-offset-1",
                          selected
                            ? "border-[#1C1917]/25 bg-gradient-to-br from-[#FAFAF9] via-white to-[#F5F5F4] shadow-sm ring-1 ring-[#1C1917]/10"
                            : "border-[#E7E5E4] bg-white hover:border-[#D6D3D1] hover:shadow-sm"
                        )}
                      >
                        {selected && (
                          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#1C1917] ring-1 ring-white" aria-hidden />
                        )}
                        <div className="flex gap-2.5 pr-3">
                          <PersonaAvatar name={p.name} size={44} className={selected ? "ring-2 ring-[#1C1917]/25" : undefined} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-semibold leading-tight tracking-tight text-[#1C1917]">{p.name}</div>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[#78716C]">{p.short_description?.trim() || "—"}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {!isRf && (
            <div className="mb-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A8A29E]">
                  内容形态
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-[#E7E5E4] to-transparent" aria-hidden />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {CONTENT_KIND_OPTIONS.map((o) => {
                  const selected = contentKind === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setContentKind(o.value)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs transition",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1C1917]/25 focus-visible:ring-offset-1",
                        selected
                          ? "border-[#1C1917]/25 bg-gradient-to-br from-[#FAFAF9] via-white to-[#F5F5F4] font-semibold text-[#1C1917] shadow-sm ring-1 ring-[#1C1917]/10"
                          : "border-[#E7E5E4] bg-white text-[#78716C] hover:border-[#D6D3D1] hover:text-[#1C1917]"
                      )}
                    >
                      <span aria-hidden>{o.emoji}</span>
                      <span>{o.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            rows={5}
            placeholder="想写的话题、角度、要点…"
            className="w-full rounded-xl border border-[#E7E5E4] bg-[#FAFAF9]/40 px-3.5 py-3 text-base text-[#1C1917] placeholder:text-[#A8A29E] focus:border-[#D6D3D1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1C1917]/15 lg:text-sm"
          />

          <div className="mt-4 rounded-xl border border-[#E7E5E4] bg-[#FAFAF9]/50">
            <button
              type="button"
              onClick={() => setMoreOptionsOpen((v) => !v)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-[#F5F5F4]/80"
            >
              {moreOptionsOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-[#A8A29E]" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-[#A8A29E]" />
              )}
              <span className="min-w-0 flex-1 text-xs font-semibold text-[#1C1917]">深度定制</span>
            </button>
            {moreOptionsOpen && (
              <div className="space-y-4 border-t border-[#E7E5E4] px-3 pb-4 pt-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#78716C]">篇幅</label>
                  <select
                    value={articleLengthSelect}
                    onChange={(e) => setArticleLengthSelect(normalizeArticleLength(e.target.value))}
                    className="h-10 w-full rounded-lg border border-[#E7E5E4] bg-white px-3 text-base text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20 lg:text-sm"
                  >
                    {ARTICLE_LENGTH_SEGMENTED.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-[#78716C]">知识</label>
                  <select
                    value={knowledgeDocId}
                    onChange={(e) => setKnowledgeDocId(e.target.value)}
                    className="h-10 w-full rounded-lg border border-[#E7E5E4] bg-white px-3 text-base text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20 lg:text-sm"
                  >
                    <option value="">未选择</option>
                    {(() => {
                      const personal = zhiShiDocs.filter((d) => !(d as Record<string, unknown>).team_id);
                      const teamDocs = zhiShiDocs.filter((d) => (d as Record<string, unknown>).team_id);
                      return (
                        <>
                          {personal.length > 0 && teamDocs.length > 0 && <optgroup label="我的文档">{personal.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</optgroup>}
                          {personal.length > 0 && teamDocs.length === 0 && personal.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                          {Object.entries(
                            teamDocs.reduce<Record<string, typeof teamDocs>>((acc, d) => {
                              const tid = (d as Record<string, unknown>).team_id as string;
                              (acc[tid] ??= []).push(d);
                              return acc;
                            }, {})
                          ).map(([tid, docs]) => (
                            <optgroup key={tid} label={teamNames[tid] ?? "团队"}>
                              {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                            </optgroup>
                          ))}
                        </>
                      );
                    })()}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-[#78716C]">任务</label>
                  <select
                    value={taskDocId}
                    onChange={(e) => setTaskDocId(e.target.value)}
                    className="h-10 w-full rounded-lg border border-[#E7E5E4] bg-white px-3 text-base text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20 lg:text-sm"
                  >
                    <option value="">未选择</option>
                    {(() => {
                      const personal = taskTemplateDocs.filter((d) => !(d as Record<string, unknown>).team_id);
                      const teamDocs = taskTemplateDocs.filter((d) => (d as Record<string, unknown>).team_id);
                      return (
                        <>
                          {personal.length > 0 && teamDocs.length > 0 && <optgroup label="我的文档">{personal.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</optgroup>}
                          {personal.length > 0 && teamDocs.length === 0 && personal.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                          {Object.entries(
                            teamDocs.reduce<Record<string, typeof teamDocs>>((acc, d) => {
                              const tid = (d as Record<string, unknown>).team_id as string;
                              (acc[tid] ??= []).push(d);
                              return acc;
                            }, {})
                          ).map(([tid, docs]) => (
                            <optgroup key={tid} label={teamNames[tid] ?? "团队"}>
                              {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                            </optgroup>
                          ))}
                        </>
                      );
                    })()}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-[#78716C]">标题</label>
                  <select
                    value={titleSelect}
                    onChange={(e) => setTitleSelect(e.target.value)}
                    className="h-10 w-full rounded-lg border border-[#E7E5E4] bg-white px-3 text-base text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20 lg:text-sm"
                  >
                    <option value="">未选择</option>
                    <option value="default">默认模版</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {quota && (
            <p className="mt-4 text-[11px] leading-relaxed text-[#78716C] lg:text-xs">
              {quota.unlimited ? (
                <span className="text-emerald-700">黑魔法生成：不限次数</span>
              ) : (
                <>
                  本周剩余 <span className="font-semibold text-[#1C1917]">{quota.remaining}</span> /{" "}
                  {quota.limit} 次
                </>
              )}
            </p>
          )}

          <button
            type="button"
            disabled={
              generating ||
              generatingTitles ||
              !personaId ||
              (!!quota && !quota.unlimited && quota.remaining === 0)
            }
            onClick={() => void generate()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1C1917] py-2.5 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
          >
            {generating || generatingTitles ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {generatingTitles ? "生成标题中…" : "生成正文中…"}
              </>
            ) : (
              "黑魔法生成"
            )}
          </button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>

      {showOutputPanel && (
      <div className="flex min-h-[min(70dvh,520px)] flex-col rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm lg:min-h-[calc(100dvh-10rem)]">
        {output.trim() ? (
          <div className="mb-2 flex shrink-0 justify-end">
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => void copyToClipboard()}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4]"
              >
                <Copy className="h-3.5 w-3.5" /> {copied ? "已复制" : "复制"}
              </button>
              <button
                type="button"
                onClick={() => void handleStar()}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-[#F5F5F4]",
                  starred ? "text-amber-600" : "text-[#78716C]"
                )}
              >
                <Star className={cn("h-3.5 w-3.5", starred && "fill-current")} />{" "}
                {starred ? "已收藏" : "收藏"}
              </button>
              <button
                type="button"
                disabled={!output.trim() || generating}
                onClick={() => setSensitiveScan(scanXhsForbidden(output))}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4] disabled:opacity-50"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                敏感词检查
              </button>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-4 text-sm text-[#1C1917]">
          {generating && !output && (
            <p className="text-[#A8A29E]">
              <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
              正在流式输出…
            </p>
          )}
          {output &&
            (sensitiveScan ? (
              <HighlightedForbiddenText text={output} scan={sensitiveScan} />
            ) : (
              <pre className="whitespace-pre-wrap font-sans">{output}</pre>
            ))}
        </div>

        {(generatingTitles || titleError || titleVariants.length > 0) && (
          <div className="mt-3 shrink-0 rounded-lg border border-[#E7E5E4] bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold text-[#1C1917]">标题候选</p>
            {titleError && <p className="mb-2 text-xs text-red-600">{titleError}</p>}
            {generatingTitles && (
              <p className="flex items-center gap-1 text-xs text-[#A8A29E]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                根据正文与人设生成 6 条标题…
              </p>
            )}
            {titleVariants.length > 0 && (
              <ul className="space-y-2">
                {titleVariants.map((t, i) => (
                  <li
                    key={`${t.type_name}-${i}`}
                    className="rounded-md border border-[#F5F5F4] bg-[#FAFAF9]/80 px-2.5 py-2 text-xs text-[#1C1917]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-[#78716C]">{t.type_name}</span>
                        <p className="mt-0.5 whitespace-pre-wrap leading-snug">{t.text}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(t.text.trim())}
                        className="shrink-0 rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"
                        title="复制该标题"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      )}

      {/* Forced feedback modal — triggers after 10 generations for non-main-site users */}
      {feedbackRequired && (
        <FeedbackModal
          onSubmitted={() => {
            setFeedbackRequired(false);
            void refreshQuota();
          }}
        />
      )}
    </div>
  );
}
