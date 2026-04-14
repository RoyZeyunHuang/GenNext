import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/news-feed/ingest
 * 外部爬虫 / Claude cowork 批量推送新闻
 * Auth: Bearer <NEWS_FEED_API_KEY>
 *
 * Body:
 * {
 *   articles: [{
 *     title: string          (必填)
 *     content: string        (必填，全文)
 *     summary?: string       (摘要，不传则自动截取 content 前 200 字)
 *     source_url?: string    (原文链接)
 *     source_name?: string   (来源，如 "36氪")
 *     image_url?: string     (封面图)
 *     tags?: string[]        (标签)
 *     published_at?: string  (发布时间 ISO，默认 now)
 *   }]
 * }
 */
export async function POST(req: NextRequest) {
  // Auth check — optional: if NEWS_FEED_API_KEY is set, require Bearer token
  const apiKey = process.env.NEWS_FEED_API_KEY?.trim();
  if (apiKey) {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (token !== apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const articles = Array.isArray(body.articles) ? body.articles : [];
  if (articles.length === 0) {
    return NextResponse.json({ error: "articles array required and must not be empty" }, { status: 400 });
  }

  // Validate and normalize
  const rows = [];
  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const title = typeof a.title === "string" ? a.title.trim() : "";
    const content = typeof a.content === "string" ? a.content.trim() : "";
    if (!title || !content) {
      return NextResponse.json(
        { error: `articles[${i}]: title and content are required` },
        { status: 400 }
      );
    }
    rows.push({
      title,
      content,
      summary: typeof a.summary === "string" && a.summary.trim() ? a.summary.trim() : content.slice(0, 200),
      source_url: typeof a.source_url === "string" ? a.source_url.trim() || null : null,
      source_name: typeof a.source_name === "string" ? a.source_name.trim() || null : null,
      image_url: typeof a.image_url === "string" ? a.image_url.trim() || null : null,
      tags: Array.isArray(a.tags) ? a.tags.filter((t: unknown) => typeof t === "string") : [],
      published_at: typeof a.published_at === "string" ? a.published_at : new Date().toISOString(),
    });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("news_feed").insert(rows).select("id, title");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: data?.length ?? 0, articles: data });
}
