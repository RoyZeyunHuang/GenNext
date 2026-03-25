"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Newspaper, Loader2 } from "lucide-react";

type ViralItem = { title: string; hook: string; source: string };
type HistoryItem = {
  id: string;
  title: string | null;
  content: string | null;
  source_url?: string | null;
};

function externalArticleUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    return null;
  }
  return null;
}

export function NewsCard() {
  const [items, setItems] = useState<ViralItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/news/daily")
      .then((r) => r.json())
      .then((d) => {
        const viral: ViralItem[] = d?.today?.social_viral_news ?? [];
        setItems(viral.slice(0, 3));
        setHistory(Array.isArray(d?.history) ? d.history.slice(0, 3) : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-lg bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-[#1C1917]">
          <Newspaper className="h-4 w-4 text-[#78716C]" />
          今日热点
        </div>
        <Link href="/news" className="text-xs text-[#78716C] hover:text-[#1C1917]">
          查看全部 →
        </Link>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-[#78716C]">
          <Loader2 className="h-4 w-4 animate-spin" />
          今日新闻加载中…
        </div>
      ) : items.length === 0 ? (
        history.length === 0 ? (
          <p className="py-4 text-sm text-[#78716C]">
            暂无今日新闻，
            <Link href="/news" className="text-[#1C1917] underline hover:no-underline">前往查看</Link>
          </p>
        ) : (
          <ul className="space-y-3">
            {history.map((it) => {
              const href = externalArticleUrl(it.source_url);
              const titleText = it.title ?? "(无标题)";
              return (
              <li key={it.id} className="border-b border-[#E7E5E4] pb-3 last:border-0 last:pb-0">
                <p className="text-sm font-medium text-[#1C1917]">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#574DFF] hover:underline"
                    >
                      {titleText}
                    </a>
                  ) : (
                    titleText
                  )}
                </p>
                {it.content ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-[#78716C]">{it.content}</p>
                ) : (
                  <p className="mt-0.5 text-xs text-[#78716C]">（无内容）</p>
                )}
              </li>
            );
            })}
          </ul>
        )
      ) : (
        <ul className="space-y-3">
          {items.map((item, i) => {
            const href = externalArticleUrl(item.source);
            return (
            <li key={i} className="border-b border-[#E7E5E4] pb-3 last:border-0 last:pb-0">
              <p className="text-sm font-medium text-[#1C1917]">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#574DFF] hover:underline"
                  >
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </p>
              <p className="mt-0.5 text-xs text-[#C2410C]">💡 {item.hook}</p>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
