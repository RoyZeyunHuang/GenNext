import { NextRequest } from "next/server";
import { runRefresh } from "@/lib/apartments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel limit for Pro is 300s; Hobby 10s

/**
 * Vercel Cron calls this with `Authorization: Bearer <CRON_SECRET>`.
 * Manual admin trigger also allowed via same bearer.
 *
 * See vercel.json: `/api/apartments/cron/refresh` scheduled daily.
 */
function authed(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  // Vercel also passes `?cron_secret=...` in some setups:
  const qs = req.nextUrl.searchParams.get("cron_secret");
  return token === expected || qs === expected;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return new Response("unauthorized", { status: 401 });
  const trigger = (req.nextUrl.searchParams.get("trigger") as "cron" | "manual" | null) ?? "cron";
  try {
    const result = await runRefresh({ triggeredBy: trigger });
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "refresh failed" },
      { status: 500 }
    );
  }
}

// GET used by Vercel Cron dashboard for uptime check
export async function GET(req: NextRequest) {
  return POST(req);
}
