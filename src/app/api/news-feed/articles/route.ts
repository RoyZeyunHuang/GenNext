import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/news-feed/articles
 * 批量补图：用 source_url 定位文章，更新 image_url 字段。
 *
 * Auth: Bearer <NEWS_FEED_API_KEY>
 *
 * Body:
 *   { patches: [ { source_url: string, image_url: string }, ... ] }
 *   或单条：{ source_url: string, image_url: string }
 *
 * Response:
 *   { updated: number, skipped: number, errors: string[] }
 */
export async function PATCH(req: NextRequest) {
  // Auth — same key as ingest
  const apiKey = process.env.NEWS_FEED_API_KEY?.trim();
  if (apiKey) {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (token !== apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));

  // Accept both array and single object
  const rawPatches: unknown[] = Array.isArray(body.patches)
    ? body.patches
    : body.source_url
    ? [body]
    : [];

  type Patch = { source_url: string; image_url: string };
  const patches: Patch[] = rawPatches.filter(
    (p): p is Patch =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as Record<string, unknown>).source_url === "string" &&
      typeof (p as Record<string, unknown>).image_url === "string"
  );

  if (patches.length === 0) {
    return NextResponse.json(
      { error: "patches 数组不能为空，每条需包含 source_url 和 image_url" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const patch of patches) {
    const { source_url, image_url } = patch;

    const { data: existing, error: fe } = await supabase
      .from("news_feed")
      .select("id")
      .eq("source_url", source_url)
      .maybeSingle();

    if (fe) {
      errors.push(`查询失败 [${source_url}]: ${fe.message}`);
      continue;
    }
    if (!existing) {
      skipped++;
      continue;
    }

    const { error: ue } = await supabase
      .from("news_feed")
      .update({ image_url })
      .eq("id", existing.id);

    if (ue) {
      errors.push(`更新失败 [${source_url}]: ${ue.message}`);
    } else {
      updated++;
    }
  }

  return NextResponse.json({ updated, skipped, errors });
}
