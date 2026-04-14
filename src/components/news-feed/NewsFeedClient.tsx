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
};

type ArticleFull = ArticleSummary & {
  content: string;
  source_url: string | null;
  created_at: string;
};

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

/** Pseudo "likes count" derived from id — XHS cards always show a number */
function pseudoLikes(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 131 + id.charCodeAt(i)) | 0;
  const n = (Math.abs(hash) % 9900) + 100;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Variable aspect ratio for masonry feel */
function aspectFor(id: string): string {
  const options = ["aspect-[3/4]", "aspect-[4/5]", "aspect-square", "aspect-[3/4]", "aspect-[4/5]"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 17 + id.charCodeAt(i)) | 0;
  return options[Math.abs(hash) % options.length];
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
  const hasImage = !!article.image_url;
  const likes = useMemo(() => pseudoLikes(article.id), [article.id]);
  const gradient = useMemo(() => gradientFor(article.id), [article.id]);
  const aspect = useMemo(() => aspectFor(article.id), [article.id]);
  const initial = (article.source_name ?? "新").slice(0, 1);

  return (
    <div
      className="mb-2 cursor-pointer overflow-hidden rounded-[10px] bg-white active:opacity-80"
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
        </div>
      ) : (
        <div
          className={cn(
            "relative w-full bg-gradient-to-br",
            gradient,
            aspect
          )}
        >
          {/* Decorative title preview on placeholder */}
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <p className="line-clamp-4 text-center text-[13px] font-bold leading-tight text-white/90 drop-shadow-sm">
              {article.title}
            </p>
          </div>
        </div>
      )}

      {/* Card body */}
      <div className="px-2.5 pb-2 pt-2">
        {/* Title */}
        <p className="line-clamp-2 text-[13px] leading-snug text-[#222]">
          {article.title}
        </p>

        {/* Footer: source + likes */}
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#999]">
          <div className="flex min-w-0 items-center gap-1">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-500 text-[8px] font-bold text-white">
              {initial}
            </span>
            <span className="truncate">{article.source_name ?? "新闻"}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleLike();
            }}
            className="flex shrink-0 items-center gap-0.5"
          >
            <Heart
              className={cn(
                "h-3.5 w-3.5",
                article.bookmarked ? "fill-rose-500 text-rose-500" : "text-[#999]"
              )}
            />
            <span>{likes}</span>
          </button>
        </div>
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
  const hasImage = !!article.image_url;
  const gradient = useMemo(() => gradientFor(article.id), [article.id]);
  const likes = useMemo(() => pseudoLikes(article.id), [article.id]);
  const initial = (article.source_name ?? "新").slice(0, 1);

  return (
    <div className="flex min-h-full flex-col bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#F0F0F0] bg-white/95 px-3 py-2.5 backdrop-blur-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-full p-1.5 text-[#222] hover:bg-[#F5F5F5]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-500 text-xs font-bold text-white">
            {initial}
          </span>
          <span className="text-sm font-medium text-[#222]">{article.source_name ?? "新闻"}</span>
        </div>
        <button
          type="button"
          title="即将上线"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.alert("AI 生成功能即将上线，敬请期待 ✨");
            }
          }}
          className="flex cursor-not-allowed items-center gap-1 rounded-full bg-[#E5E5E5] px-3 py-1.5 text-xs font-medium text-[#999]"
        >
          <Sparkles className="h-3 w-3" />
          生成·即将上线
        </button>
      </div>

      {/* Image / placeholder */}
      {hasImage ? (
        <div className="w-full bg-[#F5F5F5]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={article.image_url!} alt="" className="w-full object-contain" />
        </div>
      ) : (
        <div className={cn("aspect-[3/4] w-full bg-gradient-to-br", gradient)}>
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

        {/* Tags */}
        {article.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {article.tags.map((t) => (
              <span
                key={t}
                className="text-[13px] font-medium text-[#1e5dc0]"
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Meta */}
        <div className="mt-4 text-[12px] text-[#999]">
          {relativeDate(article.published_at)}
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
            <Heart
              className={cn(
                "h-6 w-6 transition",
                article.bookmarked ? "fill-rose-500 text-rose-500" : "text-[#555]"
              )}
            />
            <span className="text-[10px] text-[#999]">
              {article.bookmarked ? "已收藏" : likes}
            </span>
          </button>
          <button
            onClick={onToggleBookmark}
            className="flex flex-col items-center gap-0.5"
          >
            <Bookmark
              className={cn(
                "h-6 w-6",
                article.bookmarked ? "fill-amber-400 text-amber-400" : "text-[#555]"
              )}
            />
            <span className="text-[10px] text-[#999]">收藏</span>
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

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    const res = await fetch(`/api/news-feed/${id}`);
    if (res.ok) {
      setOpenArticle(await res.json());
      window.scrollTo({ top: 0 });
    }
    setDetailLoading(false);
  };

  const toggleBookmark = async (id: string) => {
    const res = await fetch(`/api/news-feed/${id}/bookmark`, { method: "POST" });
    if (!res.ok) return;
    const { bookmarked } = await res.json();
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, bookmarked } : a)));
    if (openArticle?.id === id) {
      setOpenArticle((prev) => (prev ? { ...prev, bookmarked } : prev));
    }
  };

  const generateFromArticle = (article: ArticleFull) => {
    const text = `【${article.title}】\n\n${article.content}`;
    const encoded = encodeURIComponent(text);
    router.push(`/rednote-factory/copywriter-rag?news_ref=${encoded}`);
  };

  // Detail view
  if (openArticle) {
    return (
      <ArticleDetail
        article={openArticle}
        onBack={() => setOpenArticle(null)}
        onToggleBookmark={() => toggleBookmark(openArticle.id)}
        onGenerate={() => generateFromArticle(openArticle)}
      />
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
