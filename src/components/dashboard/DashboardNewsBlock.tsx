"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Newspaper, Loader2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

const UNCATEGORIZED_KEY = "__uncategorized__";

type NewsItem = {
  id: string;
  title: string | null;
  content: string | null;
  summary_zh: string | null;
  category: string | null;
  tags: string[] | null;
};

const PILL_COLORS = [
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-blue-100 text-blue-800",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
  "bg-sky-100 text-sky-800",
];

function pillColor(tag: string, index: number): string {
  const i = (tag.length + index) % PILL_COLORS.length;
  return PILL_COLORS[i];
}

export function DashboardNewsBlock() {
  const { t } = useLocale();
  const [list, setList] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const byCategory = useMemo(() => {
    const map = new Map<string, NewsItem[]>();
    for (const it of list) {
      const cat = it.category?.trim() || UNCATEGORIZED_KEY;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(it);
    }
    const keys = Array.from(map.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
      .map(([k]) => k);
    return { keys, map };
  }, [list]);

  useEffect(() => {
    fetch("/api/news/daily", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const raw = Array.isArray(d?.history) ? d.history : [];
        setList(
          raw.map((it: Record<string, unknown>) => ({
            id: it.id as string,
            title: (it.title as string) ?? (it.summary_zh as string) ?? null,
            content: (it.content as string) ?? (it.summary_zh as string) ?? null,
            summary_zh: (it.summary_zh as string) ?? null,
            category: (it.category as string) ?? null,
            tags: Array.isArray(it.tags) ? (it.tags as string[]) : [],
          }))
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-[#1C1917]">
          <Newspaper className="h-4 w-4 text-[#78716C]" />
          {t("dashboard.newsTitle")}
        </div>
        <Link href="/news" className="text-xs text-[#78716C] hover:text-[#1C1917]">
          {t("dashboard.newsViewAll")}
        </Link>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-[#78716C]">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("dashboard.newsLoading")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {byCategory.keys.length === 0 ? (
            <p className="col-span-full py-4 text-sm text-[#78716C]">{t("dashboard.newsEmpty")}</p>
          ) : (
            byCategory.keys.map((cat) => (
              <section key={cat}>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-[#78716C]">
                  {cat === UNCATEGORIZED_KEY ? t("dashboard.newsCategoryNone") : cat}
                </h4>
                <ul className="space-y-3">
                  {(byCategory.map.get(cat) ?? []).length === 0 ? (
                    <li className="text-xs text-[#78716C]">{t("common.noData")}</li>
                  ) : (
                    (byCategory.map.get(cat) ?? []).slice(0, 3).map((it) => (
                      <li
                        key={it.id}
                        className="border-b border-[#E7E5E4] pb-3 last:border-0 last:pb-0"
                      >
                        <p className="text-sm font-medium text-[#1C1917]">
                          {it.title ?? it.summary_zh ?? "(无标题)"}
                        </p>
                        {(it.content || it.summary_zh) && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-[#78716C]">
                            {it.content || it.summary_zh}
                          </p>
                        )}
                        {(it.tags ?? []).length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {(it.tags ?? []).map((t, i) => (
                              <span
                                key={`${t}-${i}`}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${pillColor(t, i)}`}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
