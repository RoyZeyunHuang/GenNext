import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  generateOverlaysForArticles,
  type NewsArticleForOverlay,
} from "@/lib/news-persona-generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/news-feed/backfill-overlay
 * 给老的未 overlay 的新闻批量补跑黑魔法 RAG。
 *
 * Auth: Bearer <NEWS_FEED_API_KEY>（和 ingest 同钥匙）
 *
 * Body:
 * {
 *   limit?: number         (默认 6，最多 20)
 *   article_ids?: string[] (可选，指定要补跑的文章 id；不传则自动挑选 persona_name IS NULL 的最新若干条)
 *   days?: number          (可选，只补最近 N 天的；默认 14)
 * }
 *
 * Response: 同 ingest overlay 结构
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.NEWS_FEED_API_KEY?.trim();
  if (apiKey) {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (token !== apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(20, Math.max(1, Number(body.limit) || 6));
  const days = Math.max(1, Number(body.days) || 14);
  const explicitIds = Array.isArray(body.article_ids)
    ? (body.article_ids.filter((x: unknown) => typeof x === "string") as string[])
    : null;

  const admin = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  let q = admin
    .from("news_feed")
    .select("id, title, summary, content, source_name, tags, published_at")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (explicitIds && explicitIds.length > 0) {
    q = q.in("id", explicitIds);
  } else {
    q = q.is("persona_name", null).gte("published_at", cutoff);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as NewsArticleForOverlay[];
  if (rows.length === 0) {
    return NextResponse.json({
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      details: { reason: "no candidates" },
    });
  }

  const result = await generateOverlaysForArticles(admin, rows, { maxCount: limit });
  return NextResponse.json({
    attempted: rows.length,
    succeeded: result.succeeded.length,
    failed: result.failed.length,
    skipped: result.skipped.length,
    details: result,
  });
}
