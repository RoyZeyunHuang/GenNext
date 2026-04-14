"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Sparkles,
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
  if (diffH < 24) return `${diffH} 小时前`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} 天前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* Article Card                                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function ArticleCard({
  article,
  onOpen,
  onToggleBookmark,
}: {
  article: ArticleSummary;
  onOpen: () => void;
  onToggleBookmark: () => void;
}) {
  return (
    <div
      className="group cursor-pointer rounded-xl border border-[#E7E5E4] bg-white transition hover:shadow-sm"
      onClick={onOpen}
    >
      {article.image_url && (
        <div className="relative h-36 w-full overflow-hidden rounded-t-xl bg-[#F5F5F4]">
          <img
            src={article.image_url}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
      <div className="p-4">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[#1C1917] group-hover:text-[#44403C]">
            {article.title}
          </h3>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleBookmark();
            }}
            className="shrink-0 rounded-lg p-1 hover:bg-[#F5F5F4]"
          >
            <Bookmark
              className={cn(
                "h-4 w-4",
                article.bookmarked
                  ? "fill-amber-400 text-amber-400"
                  : "text-[#D6D3D1]"
              )}
            />
          </button>
        </div>
        {article.summary && (
          <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-[#78716C]">
            {article.summary}
          </p>
        )}
        <div className="flex items-center gap-2 text-[10px] text-[#A8A29E]">
          {article.source_name && <span>{article.source_name}</span>}
          {article.source_name && <span>·</span>}
          <span>{relativeDate(article.published_at)}</span>
        </div>
        {article.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {article.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-md bg-[#F5F5F4] px-1.5 py-0.5 text-[10px] text-[#78716C]"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* Article Detail                                  */
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
  return (
    <div className="flex-1">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E7E5E4] bg-white/95 px-4 py-3 backdrop-blur-sm lg:bg-[#FAFAF9]/95">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-[#78716C] hover:bg-[#F5F5F4]"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleBookmark}
            className={cn(
              "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              article.bookmarked
                ? "bg-amber-50 text-amber-600"
                : "border border-[#E7E5E4] bg-white text-[#78716C] hover:bg-[#F5F5F4]"
            )}
          >
            <Bookmark
              className={cn(
                "h-3.5 w-3.5",
                article.bookmarked && "fill-amber-400"
              )}
            />
            {article.bookmarked ? "已收藏" : "收藏"}
          </button>
          <button
            onClick={onGenerate}
            className="flex items-center gap-1 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#292524]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            一键生成文案
          </button>
        </div>
      </div>

      {/* Content */}
      <article className="mx-auto max-w-2xl px-5 py-6">
        <h1 className="mb-3 text-xl font-bold leading-snug text-[#1C1917]">
          {article.title}
        </h1>
        <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-[#A8A29E]">
          {article.source_name && (
            <span className="rounded-md bg-[#F5F5F4] px-2 py-0.5 font-medium text-[#78716C]">
              {article.source_name}
            </span>
          )}
          <span>{new Date(article.published_at).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}</span>
          {article.source_url && (
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-blue-500 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              原文
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {article.tags.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            {article.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-[#F5F5F4] px-2.5 py-0.5 text-[11px] text-[#78716C]"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="prose prose-sm prose-stone max-w-none whitespace-pre-wrap text-sm leading-relaxed text-[#44403C]">
          {article.content}
        </div>
      </article>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* Main News Feed Client                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export function NewsFeedClient() {
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "bookmarked">("all");

  // Detail view
  const [openArticle, setOpenArticle] = useState<ArticleFull | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const limit = 20;

  const fetchList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filter === "bookmarked") params.set("bookmarked", "true");
    const res = await fetch(`/api/news-feed?${params}`);
    if (res.ok) {
      const data = await res.json();
      setArticles(data.articles ?? []);
      setTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [page, filter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    const res = await fetch(`/api/news-feed/${id}`);
    if (res.ok) {
      setOpenArticle(await res.json());
    }
    setDetailLoading(false);
  };

  const toggleBookmark = async (id: string) => {
    const res = await fetch(`/api/news-feed/${id}/bookmark`, { method: "POST" });
    if (!res.ok) return;
    const { bookmarked } = await res.json();

    // Update list
    setArticles((prev) =>
      prev.map((a) => (a.id === id ? { ...a, bookmarked } : a))
    );
    // Update detail if open
    if (openArticle?.id === id) {
      setOpenArticle((prev) => (prev ? { ...prev, bookmarked } : prev));
    }
  };

  const generateFromArticle = (article: ArticleFull) => {
    // Navigate to copywriter with article content pre-filled as user input
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

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#1C1917]">新闻推送</h1>
        <div className="flex gap-1 rounded-lg border border-[#E7E5E4] bg-white p-0.5">
          <button
            onClick={() => { setFilter("all"); setPage(1); }}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition",
              filter === "all"
                ? "bg-[#1C1917] text-white"
                : "text-[#78716C] hover:text-[#1C1917]"
            )}
          >
            全部
          </button>
          <button
            onClick={() => { setFilter("bookmarked"); setPage(1); }}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition",
              filter === "bookmarked"
                ? "bg-[#1C1917] text-white"
                : "text-[#78716C] hover:text-[#1C1917]"
            )}
          >
            已收藏
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-20 text-center text-sm text-[#A8A29E]">加载中…</div>
      ) : articles.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-sm text-[#A8A29E]">
            {filter === "bookmarked" ? "还没有收藏的文章" : "暂无新闻"}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <ArticleCard
                key={a.id}
                article={a}
                onOpen={() => openDetail(a.id)}
                onToggleBookmark={() => toggleBookmark(a.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-[#E7E5E4] p-2 text-[#78716C] disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-[#78716C]">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-[#E7E5E4] p-2 text-[#78716C] disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
