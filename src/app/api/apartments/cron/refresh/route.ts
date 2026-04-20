import { NextRequest } from "next/server";
import { refreshViaScrapingBee } from "@/lib/apartments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ScrapingBee 同步模式：40 栋楼并发分批，每栋 ~5s，总时长 60-200s；
// 给个 300s 的 headroom，Vercel Pro 上限是 900s。
export const maxDuration = 300;

/**
 * Vercel Cron 每天 UTC 13:00 调这个端点（Authorization: Bearer <CRON_SECRET>）。
 *
 * 新架构（2026-04 换 ScrapingBee 之后）：
 *  - 同步直连：在这个 function 里跑完所有 tracked building 的抓取 + 解析 + 入库
 *  - 数据来源：apt_buildings.is_tracked=true 的楼盘
 *  - 静态字段（year_built / amenities）仅在缺值时填补；动态字段每次覆盖
 *  - listings 字段范围以 SE 建筑页能提供的为准（sqft / floor_plan_url 不抓，
 *    前端通过 listing.url 外链）
 *
 * 见 vercel.json: `/api/apartments/cron/refresh` 每日 UTC 13:00 执行。
 */

function authed(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const qs = req.nextUrl.searchParams.get("cron_secret");
  return token === expected || qs === expected;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return new Response("unauthorized", { status: 401 });

  const trigger = (req.nextUrl.searchParams.get("trigger") as
    | "cron"
    | "manual"
    | null) ?? "cron";

  try {
    const result = await refreshViaScrapingBee({ triggeredBy: trigger });
    return Response.json({
      ok: result.status === "ok",
      mode: "sync",
      ...result,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "refresh failed" },
      { status: 500 },
    );
  }
}

// GET used by Vercel Cron dashboard for uptime check
export async function GET(req: NextRequest) {
  return POST(req);
}
