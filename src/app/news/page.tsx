"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Sparkles, Loader2, Newspaper, Flame, CheckCircle } from "lucide-react";

type ExecNews = { title: string; source: string; summary: string };
type ViralNews = { title: string; hook: string; source: string };
type TodayData = { date: string; executive_news: ExecNews[]; social_viral_news: ViralNews[] };

export default function NewsPage() {
  const [today, setToday] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news/daily");
      const data = await res.json();
      if (data.today) {
        setToday(data.today);
        setLastUpdated(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

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

  return (
    <div className="p-6">
      {/* header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1917]">每日新闻</h1>
          <p className="mt-1 text-sm text-[#78716C]">{todayDate}</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && <span className="text-xs text-[#A8A29E]">更新于 {lastUpdated}</span>}
          <button
            type="button"
            onClick={fetchNews}
            disabled={loading}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#E7E5E4] px-4 text-xs font-medium text-[#1C1917] hover:bg-[#F5F5F4] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新新闻
          </button>
        </div>
      </div>

      {loading && !today ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[#78716C]" />
          <span className="ml-2 text-sm text-[#78716C]">加载新闻中…</span>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* executive news */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Newspaper className="h-4.5 w-4.5 text-[#78716C]" />
              <h2 className="text-sm font-medium text-[#1C1917]">📊 行业简报</h2>
              <span className="text-xs text-[#A8A29E]">({today?.executive_news?.length ?? 0})</span>
            </div>
            <div className="space-y-3">
              {(today?.executive_news ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-[#78716C]">暂无行业简报</p>
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
                          onClick={() => saveAsInspiration(key, item.source, `${item.title}\n${item.summary}`, "行业简报")}
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
                          {isSaved ? "已保存" : "转为文案灵感"}
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
              <h2 className="text-sm font-medium text-[#1C1917]">🔥 社媒选题</h2>
              <span className="text-xs text-[#A8A29E]">({today?.social_viral_news?.length ?? 0})</span>
            </div>
            <div className="space-y-3">
              {(today?.social_viral_news ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-[#78716C]">暂无社媒选题</p>
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
                          onClick={() => saveAsInspiration(key, item.source, `${item.title}\n${item.hook}`, "社媒选题")}
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
                          {isSaved ? "已保存" : "转为文案灵感"}
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
      )}
    </div>
  );
}
