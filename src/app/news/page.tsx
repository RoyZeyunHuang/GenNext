"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Sparkles, Loader2, Newspaper, Flame, CheckCircle } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { PageHeader } from "@/components/PageHeader";

type ExecNews = { title: string; source: string; summary: string };
type ViralNews = { title: string; hook: string; source: string };
type TodayData = { date: string; executive_news: ExecNews[]; social_viral_news: ViralNews[] };
type HistoryItem = {
  id: string;
  title: string | null;
  content: string | null;
  category: string | null;
  tags: string[] | null;
  publish_date: string | null;
  created_at: string | null;
};

export default function NewsPage() {
  const { t } = useLocale();
  const [today, setToday] = useState<TodayData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const fetchNews = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/news/daily");
      const data = await res.json();
      if (data.today) {
        setToday(data.today);
        setLastUpdated(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
      }
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch { /* ignore */ }
    if (!silent) setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  useEffect(() => {
    const intervalMs = 60_000;
    const id = window.setInterval(() => {
      fetchNews({ silent: true });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [fetchNews]);

  const saveAsInspiration = async (key: string, sourceUrl: string, summaryZh: string, tag: string) => {
    if (saved.has(key)) return;
    setSaving(key);
    try {
      await fetch("/api/news/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: sourceUrl, summary_zh: summaryZh, tags: [tag] }),
      });
      setSaved((prev) => new Set(prev).add(key));
    } catch { /* ignore */ }
    setSaving(null);
  };

  const todayDate = today?.date || new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const hasToday =
    (today?.executive_news?.length ?? 0) > 0 || (today?.social_viral_news?.length ?? 0) > 0;

  return (
    <div className="p-6">
      <PageHeader titleKey="news.title" pageTitleKey="pages.news" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="mt-1 text-sm text-[#78716C]">{todayDate}</p>
        <div className="flex items-center gap-3">
          {lastUpdated && <span className="text-xs text-[#A8A29E]">{t("news.updatedAt")} {lastUpdated}</span>}
          <button
            type="button"
            onClick={() => fetchNews()}
            disabled={loading || refreshing}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#E7E5E4] px-4 text-xs font-medium text-[#1C1917] hover:bg-[#F5F5F4] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${(loading || refreshing) ? "animate-spin" : ""}`} />
            {t("news.refresh")}
          </button>
        </div>
      </div>

      {loading && !today ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[#78716C]" />
          <span className="ml-2 text-sm text-[#78716C]">{t("news.loading")}</span>
        </div>
      ) : hasToday ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* executive news */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Newspaper className="h-4.5 w-4.5 text-[#78716C]" />
              <h2 className="text-sm font-medium text-[#1C1917]">📊 {t("news.sectionExecutive")}</h2>
              <span className="text-xs text-[#A8A29E]">({today?.executive_news?.length ?? 0})</span>
            </div>
            <div className="space-y-3">
              {(today?.executive_news ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-[#78716C]">{t("news.emptyExecutive")}</p>
              ) : (
                (today?.executive_news ?? []).map((item, i) => {
                  const key = `exec_${i}`;
                  const isSaved = saved.has(key);
                  return (
                    <div key={i} className="rounded-lg bg-white p-5 shadow-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-[#1C1917]">{item.title}</h3>
                          <p className="mt-0.5 text-xs text-[#A8A29E]">{item.source}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => saveAsInspiration(key, item.source, `${item.title}\n${item.summary}`, t("news.tagExecutive"))}
                          disabled={saving === key || isSaved}
                          className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-colors ${
                            isSaved
                              ? "bg-emerald-50 text-emerald-600"
                              : "border border-[#E7E5E4] text-[#78716C] hover:bg-[#F5F5F4]"
                          }`}
                        >
                          {saving === key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isSaved ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          {isSaved ? t("news.saved") : t("news.saveAsInspiration")}
                        </button>
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-[#44403C]">{item.summary}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* social viral news */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Flame className="h-4.5 w-4.5 text-[#78716C]" />
              <h2 className="text-sm font-medium text-[#1C1917]">🔥 {t("news.sectionViral")}</h2>
              <span className="text-xs text-[#A8A29E]">({today?.social_viral_news?.length ?? 0})</span>
            </div>
            <div className="space-y-3">
              {(today?.social_viral_news ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-[#78716C]">{t("news.emptyViral")}</p>
              ) : (
                (today?.social_viral_news ?? []).map((item, i) => {
                  const key = `viral_${i}`;
                  const isSaved = saved.has(key);
                  return (
                    <div key={i} className="rounded-lg bg-white p-5 shadow-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-[#1C1917]">{item.title}</h3>
                          <p className="mt-0.5 text-xs text-[#A8A29E]">{item.source}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => saveAsInspiration(key, item.source, `${item.title}\n${item.hook}`, t("news.tagViral"))}
                          disabled={saving === key || isSaved}
                          className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-colors ${
                            isSaved
                              ? "bg-emerald-50 text-emerald-600"
                              : "border border-[#E7E5E4] text-[#78716C] hover:bg-[#F5F5F4]"
                          }`}
                        >
                          {saving === key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isSaved ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          {isSaved ? t("news.saved") : t("news.saveAsInspiration")}
                        </button>
                      </div>
                      <div className="mt-3 rounded-lg bg-[#FFF7ED] px-3 py-2">
                        <p className="text-xs font-medium text-[#C2410C]">💡 {item.hook}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-[#1C1917]">
              <Newspaper className="h-4.5 w-4.5 text-[#78716C]" />
              {t("news.todaySourceEmpty")}
            </div>
            {lastUpdated && <span className="text-xs text-[#A8A29E]">{t("news.updatedAt")} {lastUpdated}</span>}
          </div>
          {history.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#78716C]">
              {t("news.noHistory")}
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((it) => (
                <div key={it.id} className="rounded-lg bg-[#FAFAF9] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#1C1917]">{it.title ?? t("news.noTitle")}</p>
                      <p className="mt-1 text-xs text-[#A8A29E]">
                        {it.publish_date ?? it.created_at ?? ""}{it.category ? ` · ${it.category}` : ""}
                      </p>
                    </div>
                  </div>
                  {it.content ? (
                    <p className="mt-2 text-xs leading-relaxed text-[#44403C]">{it.content}</p>
                  ) : (
                    <p className="mt-2 text-xs text-[#78716C]">{t("news.noContent")}</p>
                  )}
                  {(it.tags ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(it.tags ?? []).slice(0, 6).map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-[#E7E5E4] bg-white px-2 py-0.5 text-[10px] text-[#78716C]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
