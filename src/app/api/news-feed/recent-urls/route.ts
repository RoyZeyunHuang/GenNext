import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/news-feed/recent-urls?days=7
 * 返回最近 N 天已入库的 source_url 列表，供爬虫端去重。
 *
 * Auth: Bearer <NEWS_FEED_API_KEY>
 *
 * Query params:
 *   days  — 往前查多少天（默认 7，最大 90）
 *
 * Response:
 *   { urls: string[], count: number }
 */
export async function GET(req: NextRequest) {
  // Auth — same key as ingest / articles
  const apiKey = process.env.NEWS_FEED_API_KEY?.trim();
  if (apiKey) {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (token !== apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "7", 10) || 7, 1), 90);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("news_feed")
    .select("source_url")
    .gte("created_at", since)
    .not("source_url", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const urls = (data ?? [])
    .map((r) => r.source_url as string)
    .filter(Boolean);

  return NextResponse.json({ urls, count: urls.length });
}
