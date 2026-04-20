/**
 * 调试/预览端点：给一个 StreetEasy URL，返回 parser 抽出的结构化数据。
 *
 * 不碰 DB，不触发任何后台任务。用途：
 *  - 你怀疑某栋楼的数据不对时，直接丢 URL 进来看 parser 到底取到了什么
 *  - 加新字段后验证抽取是否生效
 *  - admin UI 未来做"新增楼盘前预览"用的后端
 *
 * 鉴权：复用 CRON_SECRET（和 /api/apartments/cron/refresh 同一把钥匙）。
 * 用法：
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://<host>/api/apartments/admin/scrape-preview?url=https://streeteasy.com/building/the-orchard-42-06-orchard-street"
 */

import { NextRequest } from "next/server";
import { scrapeBuilding } from "@/lib/apartments/scrape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authed(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const qs = req.nextUrl.searchParams.get("cron_secret");
  return token === expected || qs === expected;
}

function isValidSeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.endsWith("streeteasy.com");
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return new Response("unauthorized", { status: 401 });

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return Response.json({ error: "missing url query param" }, { status: 400 });
  }
  if (!isValidSeUrl(url)) {
    return Response.json(
      { error: "url must be a streeteasy.com URL" },
      { status: 400 },
    );
  }

  // 可选的精简模式：?brief=true 时只返回 summary，省下巨大 JSON 体
  const brief = req.nextUrl.searchParams.get("brief") === "true";

  const started = Date.now();
  try {
    const data = await scrapeBuilding(url);
    const durationMs = Date.now() - started;

    const response = {
      ok: true,
      url,
      duration_ms: durationMs,
      listings_count: data.listings.length,
      summary: {
        name: data.static.name,
        address: data.static.address,
        year_built: data.static.year_built,
        floor_count: data.static.floor_count,
        active_rentals_count: data.dynamic.active_rentals_count,
        amenities_count: data.static.amenities.length,
        price_range:
          data.listings.length > 0
            ? {
                min: Math.min(
                  ...data.listings.map((l) => l.price_monthly ?? Infinity),
                ),
                max: Math.max(
                  ...data.listings.map((l) => l.price_monthly ?? 0),
                ),
              }
            : null,
      },
      ...(brief
        ? {}
        : {
            static: data.static,
            dynamic: data.dynamic,
            listings: data.listings,
          }),
    };
    return Response.json(response);
  } catch (e) {
    const durationMs = Date.now() - started;
    return Response.json(
      {
        ok: false,
        url,
        duration_ms: durationMs,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
