"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Bookmark,
  Heart,
  MessageCircle,
  Search,
  Share2,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";

/* ─── Types ─── */
type ArticleSummary = {
  id: string;
  title: string;
  summary: string | null;
  source_name: string | null;
  image_url: string | null;
  tags: string[];
  published_at: string;
  bookmarked: boolean;
  persona_name?: string | null;
  persona_id?: string | null;
  persona_angle?: string | null;
};

type ArticleFull = ArticleSummary & {
  content: string;
  source_url: string | null;
  created_at: string;
  doc_id: string | null;
  original_title?: string | null;
  original_content?: string | null;
  original_source_name?: string | null;
};

type PromptKey = "share" | "experience" | "market";

const PROMPT_TEMPLATES: Record<
  PromptKey,
  { emoji: string; label: string; desc: string; text: string }
> = {
  share: {
    emoji: "📰",
    label: "分享这条新闻资讯",
    desc: "把新闻的重点信息转化成小红书笔记",
    text: "写一篇分享以下新闻资讯的笔记",
  },
  experience: {
    emoji: "✨",
    label: "亲历活动 / 体验",
    desc: "我去了 / 参加了，分享真实经历",
    text: "我参加了这个活动，写一篇笔记分享我的经历",
  },
  market: {
    emoji: "💼",
    label: "给客户的市场观察",
    desc: "地产 / 政策类新闻，解读给客户看",
    text: "基于这条新闻写一篇给客户的市场观察/解读笔记",
  },
};

/* ─── Persona avatar helper ─── */
const PERSONA_IMAGE_NAMES = [
  "Aurora", "Bella", "Beverly", "Caesy", "Cammy",
  "Freya", "Kelvin", "Luke", "Mia", "Ray", "Sabrina",
];
function personaAvatarSrc(name: string): string {
  const hit = PERSONA_IMAGE_NAMES.find(
    (k) => k.toLowerCase() === name.trim().toLowerCase()
  );
  return hit ? `/profileimages/${hit}.png` : "/profileimages/Profile_placeholder.png";
}

/* ─── Helpers ─── */
function relativeDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return "刚刚";
  if (diffH < 24) return `${diffH}小时前`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}天前`;
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

/** Generate gradient placeholder colors from article id (for articles without image) */
function gradientFor(id: string): string {
  const palettes = [
    "from-rose-200 via-pink-200 to-orange-200",
    "from-amber-100 via-orange-200 to-rose-200",
    "from-sky-200 via-indigo-200 to-purple-200",
    "from-emerald-200 via-teal-200 to-cyan-200",
    "from-violet-200 via-fuchsia-200 to-pink-200",
    "from-yellow-100 via-lime-200 to-emerald-200",
    "from-cyan-100 via-sky-200 to-blue-300",
    "from-fuchsia-200 via-rose-200 to-amber-200",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return palettes[Math.abs(hash) % palettes.length];
}

/** Variable aspect ratio for masonry feel */
function aspectFor(id: string): string {
  const options = ["aspect-[3/4]", "aspect-[4/5]", "aspect-square", "aspect-[3/4]", "aspect-[4/5]"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 17 + id.charCodeAt(i)) | 0;
  return options[Math.abs(hash) % options.length];
}

/** 标签药丸色板：根据 tag 字符串 hash 稳定分配 */
function tagPillClass(tag: string): string {
  const palettes = [
    "bg-rose-100 text-rose-700",
    "bg-sky-100 text-sky-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-800",
    "bg-violet-100 text-violet-700",
    "bg-pink-100 text-pink-700",
    "bg-teal-100 text-teal-700",
    "bg-fuchsia-100 text-fuchsia-700",
  ];
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 131 + tag.charCodeAt(i)) | 0;
  return palettes[Math.abs(hash) % palettes.length];
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* Article Card (XHS style)                        */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function ArticleCard({
  article,
  onOpen,
  onToggleLike,
}: {
  article: ArticleSummary;
  onOpen: () => void;
  onToggleLike: () => void;
}) {
  const isPersona = !!article.persona_name;
  const hasImage = !isPersona && !!article.image_url;
  const gradient = useMemo(() => gradientFor(article.id), [article.id]);
  const aspect = useMemo(() => aspectFor(article.id), [article.id]);
  const displayName = isPersona ? article.persona_name! : (article.source_name ?? "新闻");
  const initial = displayName.slice(0, 1);

  return (
    <div
      className="mb-2 block break-inside-avoid cursor-pointer overflow-hidden rounded-[10px] bg-white active:opacity-80 [-webkit-column-break-inside:avoid] [page-break-inside:avoid]"
      onClick={onOpen}
    >
      {/* Image / placeholder */}
      {hasImage ? (
        <div className="relative w-full overflow-hidden bg-[#F5F5F5]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.image_url!}
            alt=""
            className="w-full object-cover"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = "none";
            }}
          />
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white/90 backdrop-blur-sm">
            {relativeDate(article.published_at)}
          </span>
        </div>
      ) : (
        <div
          className={cn(
            "relative w-full bg-gradient-to-br",
            gradient,
            aspect
          )}
        >
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <p className="line-clamp-4 text-center text-[13px] font-bold leading-tight text-white/90 drop-shadow-sm">
              {article.title}
            </p>
          </div>
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] font-medium text-white/80">
            {relativeDate(article.published_at)}
          </span>
        </div>
      )}

      {/* Card body */}
      <div className="px-2.5 pb-2 pt-2">
        {/* Title */}
        <p className="line-clamp-2 text-[13px] leading-snug text-[#222]">
          {article.title}
        </p>

        {/* Colorful tag pills */}
        {article.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {article.tags.map((t) => (
              <span
                key={t}
                className={cn(
                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                  tagPillClass(t)
                )}
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Footer: source + date + bookmark */}
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#999]">
          <div className="flex min-w-0 items-center gap-1">
            {isPersona ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={personaAvatarSrc(displayName)}
                alt=""
                className="h-4 w-4 shrink-0 rounded-full object-cover object-top"
              />
            ) : (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-500 text-[8px] font-bold text-white">
                {initial}
              </span>
            )}
            <span className={cn("truncate", isPersona && "font-medium text-violet-600")}>
              {displayName}
            </span>
            <span className="shrink-0 text-[10px] text-[#BBB]">·</span>
            <span className="shrink-0 text-[10px] text-[#BBB]">
              {relativeDate(article.published_at)}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleLike();
            }}
            className="flex shrink-0 items-center gap-0.5"
            aria-label={article.bookmarked ? "已收藏" : "收藏"}
          >
            <Heart
              className={cn(
                "h-3.5 w-3.5",
                article.bookmarked ? "fill-rose-500 text-rose-500" : "text-[#999]"
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* Generate Sheet — 3 prompt templates            */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function GenerateSheet({
  onPick,
  onClose,
  busy,
}: {
  onPick: (key: PromptKey) => void;
  onClose: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-4 pb-6 lg:rounded-2xl"
        style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[15px] font-bold text-[#222]">选一个写作角度</p>
            <p className="mt-0.5 text-[11px] text-[#999]">
              AI 会用这条新闻作为知识库、按你选的角度写
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#999] hover:bg-[#F5F5F5]"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {(Object.keys(PROMPT_TEMPLATES) as PromptKey[]).map((key) => {
            const opt = PROMPT_TEMPLATES[key];
            return (
              <button
                key={key}
                disabled={busy}
                onClick={() => onPick(key)}
                className="flex w-full items-start gap-3 rounded-xl border border-[#EEE] bg-white p-3 text-left transition hover:border-rose-200 hover:bg-rose-50/40 active:scale-[0.99] disabled:opacity-50"
              >
                <span className="text-2xl leading-none">{opt.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[#222]">
                    {opt.label}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-[#999]">
                    {opt.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {busy && (
          <p className="mt-3 text-center text-[12px] text-[#999]">跳转中…</p>
        )}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* Article Detail (XHS style)                      */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function ArticleDetail({
  article,
  onBack,
  onToggleBookmark,
  onGenerate,
}: {
  article: ArticleFull;
  onBack: () => void;
  onToggleBookmark: () => void;
  onGenerate: () => void;
}) {
  const isPersona = !!article.persona_name;
  const hasImage = !isPersona && !!article.image_url;
  const gradient = useMemo(() => gradientFor(article.id), [article.id]);
  const displayName = isPersona ? article.persona_name! : (article.source_name ?? "新闻");
  const initial = displayName.slice(0, 1);

  return (
    <div className="flex min-h-full flex-col bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-[#F0F0F0] bg-white/95 px-3 py-2.5 backdrop-blur-sm">
        <button
          onClick={onBack}
          className="flex shrink-0 items-center gap-1 rounded-full p-1.5 text-[#222] hover:bg-[#F5F5F5]"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isPersona ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={personaAvatarSrc(displayName)}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full object-cover object-top"
            />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-500 text-xs font-bold text-white">
              {initial}
            </span>
          )}
          <span className={cn(
            "truncate text-sm font-medium",
            isPersona ? "text-violet-700" : "text-[#222]"
          )}>
            {displayName}
          </span>
        </div>
        <button
          onClick={onToggleBookmark}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition",
            article.bookmarked
              ? "bg-amber-50 text-amber-700"
              : "bg-[#F5F5F5] text-[#555] hover:bg-[#EEE]"
          )}
          aria-label={article.bookmarked ? "已收藏" : "收藏"}
        >
          <Bookmark
            className={cn(
              "h-3.5 w-3.5",
              article.bookmarked && "fill-amber-400 text-amber-500"
            )}
          />
          {article.bookmarked ? "已收藏" : "收藏"}
        </button>
        <button
          type="button"
          onClick={onGenerate}
          className="flex shrink-0 items-center gap-1 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-600"
        >
          <Sparkles className="h-3 w-3" />
          生成
        </button>
      </div>

      {/* Image / placeholder */}
      {hasImage ? (
        <div className="w-full bg-[#F5F5F5]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={article.image_url!} alt="" className="w-full object-contain" />
        </div>
      ) : (
        <div className={cn(
          "aspect-[3/4] w-full bg-gradient-to-br",
          isPersona ? "from-violet-100 via-indigo-100 to-purple-200" : gradient
        )}>
          <div className="flex h-full w-full items-center justify-center p-6">
            <p className="text-center text-xl font-bold leading-tight text-white/95 drop-shadow">
              {article.title}
            </p>
          </div>
        </div>
      )}

      {/* Body */}
      <article className="flex-1 px-4 pb-28 pt-4">
        <h1 className="mb-2 text-[17px] font-bold leading-snug text-[#222]">
          {article.title}
        </h1>

        <div className="mb-4 whitespace-pre-wrap text-[15px] leading-[1.7] text-[#333]">
          {article.content}
        </div>

        {/* Tags — colorful pills */}
        {article.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {article.tags.map((t) => (
              <span
                key={t}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium",
                  tagPillClass(t)
                )}
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Meta + original source link */}
        <div className="mt-4 text-[12px] text-[#999]">
          {relativeDate(article.published_at)}
          {isPersona && article.original_title && (
            <>
              <span className="mx-2">·</span>
              <span className="text-[#BBB]">原文：{article.original_source_name ?? "新闻"}</span>
            </>
          )}
          {article.source_url && (
            <>
              <span className="mx-2">·</span>
              <a
                href={article.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1e5dc0]"
              >
                查看原文
              </a>
            </>
          )}
        </div>
      </article>

      {/* Floating bottom action bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#F0F0F0] bg-white px-4 py-3 lg:left-[200px]"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-around">
          <button
            onClick={onToggleBookmark}
            className="flex flex-col items-center gap-0.5"
          >
            <Bookmark
              className={cn(
                "h-6 w-6 transition",
                article.bookmarked ? "fill-amber-400 text-amber-500" : "text-[#555]"
              )}
            />
            <span className="text-[10px] text-[#999]">
              {article.bookmarked ? "已收藏" : "收藏"}
            </span>
          </button>
          <button
            onClick={onGenerate}
            className="flex flex-col items-center gap-0.5"
          >
            <Sparkles className="h-6 w-6 text-rose-500" />
            <span className="text-[10px] text-rose-500">生成笔记</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 opacity-40">
            <MessageCircle className="h-6 w-6 text-[#555]" />
            <span className="text-[10px] text-[#999]">评论</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 opacity-40">
            <Share2 className="h-6 w-6 text-[#555]" />
            <span className="text-[10px] text-[#999]">分享</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* Main News Feed Client (XHS style)               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export function NewsFeedClient() {
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "bookmarked">("all");

  // Detail view
  const [openArticle, setOpenArticle] = useState<ArticleFull | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Generate sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetBusy, setSheetBusy] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", limit: "50" });
    if (filter === "bookmarked") params.set("bookmarked", "true");
    const res = await fetch(`/api/news-feed?${params}`);
    if (res.ok) {
      const data = await res.json();
      setArticles(data.articles ?? []);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  /**
   * 详情视图用 history.pushState 占一条历史记录，而不改 URL。
   * 这样 iOS 边缘右滑 / 浏览器返回会触发 popstate → 关闭详情回到列表，
   * 不会再直接跳到 /news-feed 之前的页面（如黑魔法 / 外部站）。
   */
  const openDetail = async (id: string) => {
    setDetailLoading(true);
    const res = await fetch(`/api/news-feed/${id}`);
    if (res.ok) {
      const data: ArticleFull = await res.json();
      setOpenArticle(data);
      if (typeof window !== "undefined") {
        window.history.pushState(
          { newsDetail: data.id },
          "",
          window.location.href
        );
        window.scrollTo({ top: 0 });
      }
    }
    setDetailLoading(false);
  };

  const closeDetail = useCallback(() => {
    if (typeof window !== "undefined" && window.history.state?.newsDetail) {
      // 触发浏览器 back，popstate handler 会清空 openArticle
      window.history.back();
    } else {
      setOpenArticle(null);
    }
  }, []);

  // 监听浏览器返回（含 iOS 边缘滑动）
  useEffect(() => {
    const handler = () => {
      // popstate 触发时，把详情关闭
      setOpenArticle(null);
      setSheetOpen(false);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const toggleBookmark = async (id: string) => {
    const res = await fetch(`/api/news-feed/${id}/bookmark`, { method: "POST" });
    if (!res.ok) return;
    const { bookmarked, doc_id } = await res.json();
    setArticles((prev) =>
      prev.map((a) => (a.id === id ? { ...a, bookmarked } : a))
    );
    if (openArticle?.id === id) {
      setOpenArticle((prev) =>
        prev ? { ...prev, bookmarked, doc_id: doc_id ?? null } : prev
      );
    }
  };

  /** 从 sheet 选了模板后：确保 doc 存在 → 跳转 copywriter */
  const handleGenerate = async (key: PromptKey) => {
    if (!openArticle) return;
    setSheetBusy(true);
    try {
      let docId = openArticle.doc_id;
      if (!docId) {
        // 未收藏：自动收藏一下生成 doc
        const res = await fetch(`/api/news-feed/${openArticle.id}/bookmark`, {
          method: "POST",
        });
        if (res.ok) {
          const { bookmarked, doc_id } = await res.json();
          if (bookmarked && doc_id) {
            docId = doc_id;
            // 同步 UI 状态
            setOpenArticle((prev) =>
              prev ? { ...prev, bookmarked: true, doc_id: doc_id } : prev
            );
            setArticles((prev) =>
              prev.map((a) =>
                a.id === openArticle.id ? { ...a, bookmarked: true } : a
              )
            );
          }
        }
      }
      if (!docId) {
        window.alert("无法进入生成页面，请重试");
        return;
      }
      router.push(
        `/rednote-factory/copywriter-rag?news_doc_id=${encodeURIComponent(docId)}&prompt_key=${key}`
      );
    } finally {
      setSheetBusy(false);
      setSheetOpen(false);
    }
  };

  // Detail view
  if (openArticle) {
    return (
      <>
        <ArticleDetail
          article={openArticle}
          onBack={closeDetail}
          onToggleBookmark={() => toggleBookmark(openArticle.id)}
          onGenerate={() => setSheetOpen(true)}
        />
        {sheetOpen && (
          <GenerateSheet
            onPick={handleGenerate}
            onClose={() => setSheetOpen(false)}
            busy={sheetBusy}
          />
        )}
      </>
    );
  }

  if (detailLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20 text-sm text-[#A8A29E]">
        加载中…
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#F5F5F5]">
      {/* Sticky header with filter tabs */}
      <div className="sticky top-0 z-10 border-b border-[#F0F0F0] bg-white/95 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="flex flex-1 items-center gap-1.5 rounded-full bg-[#F5F5F5] px-3 py-1.5 text-[#999]">
            <Search className="h-3.5 w-3.5" />
            <span className="text-xs">搜索新闻</span>
          </div>
        </div>
        <div className="flex items-center gap-5 px-4 pb-2 text-[14px]">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "relative pb-1.5 font-medium transition",
              filter === "all" ? "text-[#222]" : "text-[#999]"
            )}
          >
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              推荐
            </span>
            {filter === "all" && (
              <span className="absolute bottom-0 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-rose-500" />
            )}
          </button>
          <button
            onClick={() => setFilter("bookmarked")}
            className={cn(
              "relative pb-1.5 font-medium transition",
              filter === "bookmarked" ? "text-[#222]" : "text-[#999]"
            )}
          >
            <span className="flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" />
              收藏
            </span>
            {filter === "bookmarked" && (
              <span className="absolute bottom-0 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-rose-500" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-20 text-center text-sm text-[#999]">加载中…</div>
      ) : articles.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-sm text-[#999]">
            {filter === "bookmarked" ? "还没有收藏的文章" : "暂无新闻"}
          </p>
        </div>
      ) : (
        <div className="px-2 pt-2">
          {/* Masonry via CSS columns */}
          <div className="gap-0 [column-count:2] [column-gap:8px] sm:[column-count:3] lg:[column-count:4] xl:[column-count:5]">
            {articles.map((a) => (
              <ArticleCard
                key={a.id}
                article={a}
                onOpen={() => openDetail(a.id)}
                onToggleLike={() => toggleBookmark(a.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
