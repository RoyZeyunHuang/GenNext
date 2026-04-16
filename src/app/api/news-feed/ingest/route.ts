import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  generateOverlaysForArticles,
  type NewsArticleForOverlay,
} from "@/lib/news-persona-generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 单次 ingest 最多挂多少篇自动 overlay（避免 Vercel 30s 超时的硬上限）
const OVERLAY_MAX_PER_BATCH = 6;
// 默认有多少比例的新闻转成虚拟人笔记（剩下的保留原样）
const DEFAULT_OVERLAY_RATIO = 0.5;

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
 *   }],
 *   generate_overlay?: boolean   (默认 true；传 false 可关闭黑魔法，所有条目都保持原新闻)
 *   overlay_ratio?: number       (0~1，默认 0.5；即本批一半转虚拟人笔记，另一半保持原新闻)
 * }
 *
 * Response:
 * {
 *   inserted: number,
 *   articles: [{id,title}],
 *   overlay?: { attempted, succeeded, failed, skipped, ratio }
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
  const generateOverlay = body.generate_overlay !== false; // 默认开启
  const overlayRatio =
    typeof body.overlay_ratio === "number" && body.overlay_ratio >= 0 && body.overlay_ratio <= 1
      ? body.overlay_ratio
      : DEFAULT_OVERLAY_RATIO;
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
  const { data, error } = await admin
    .from("news_feed")
    .insert(rows)
    .select("id, title, summary, content, source_name, tags, published_at");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const insertedRows = (data ?? []) as NewsArticleForOverlay[];

  // 自动生成虚拟人笔记（黑魔法 RAG pipeline）
  let overlay:
    | {
        attempted: number;
        succeeded: number;
        failed: number;
        skipped: number;
        ratio: number;
        details?: unknown;
      }
    | undefined;

  if (generateOverlay && insertedRows.length > 0 && overlayRatio > 0) {
    // 按 ratio 随机抽样：保证每次 ingest 命中的条目分布均匀，不总是前 N 条
    const targetByRatio = Math.ceil(insertedRows.length * overlayRatio);
    const targetCount = Math.min(OVERLAY_MAX_PER_BATCH, targetByRatio);
    const shuffled = [...insertedRows].sort(() => Math.random() - 0.5);
    const toOverlay = shuffled.slice(0, targetCount);

    try {
      const result = await generateOverlaysForArticles(admin, toOverlay);
      overlay = {
        attempted: toOverlay.length,
        succeeded: result.succeeded.length,
        failed: result.failed.length,
        skipped: result.skipped.length,
        ratio: overlayRatio,
        details: result,
      };
    } catch (e) {
      // 兜底：生成失败不阻塞 ingest 主流程
      overlay = {
        attempted: toOverlay.length,
        succeeded: 0,
        failed: toOverlay.length,
        skipped: 0,
        ratio: overlayRatio,
        details: { error: e instanceof Error ? e.message : String(e) },
      };
    }
  }

  return NextResponse.json({
    inserted: insertedRows.length,
    articles: insertedRows.map((r) => ({ id: r.id, title: r.title })),
    overlay,
  });
}
