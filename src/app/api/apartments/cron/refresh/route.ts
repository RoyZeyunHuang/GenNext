import { NextRequest } from "next/server";
import { kickRefresh } from "@/lib/apartments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Kick-and-return is fast (one Apify POST) but we keep maxDuration high in
// case Apify's API is slow to respond.
export const maxDuration = 60;

/**
 * Vercel Cron calls this with `Authorization: Bearer <CRON_SECRET>` daily.
 *
 * The actual scrape is async — we ask Apify to kick off the run with a
 * webhook pointing at /api/apartments/cron/webhook, then return immediately.
 * The webhook handler picks up the dataset when Apify finishes (5-15 min).
 *
 * This pattern bypasses Vercel's serverless ceiling: each request stays
 * under a second, but the underlying scrape can take as long as it needs.
 *
 * See vercel.json: `/api/apartments/cron/refresh` scheduled daily.
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

function buildWebhookUrl(req: NextRequest): string {
  // Reuse CRON_SECRET as the webhook auth token — keeps env simple.
  const secret = process.env.CRON_SECRET ?? "";
  // Honor explicit base URL if provided (e.g. tunneled local dev), else
  // derive from the incoming request.
  const base =
    process.env.APP_BASE_URL?.replace(/\/$/, "") ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return `${base}/api/apartments/cron/webhook?secret=${encodeURIComponent(secret)}`;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return new Response("unauthorized", { status: 401 });
  const trigger = (req.nextUrl.searchParams.get("trigger") as
    | "cron"
    | "manual"
    | null) ?? "cron";
  try {
    const result = await kickRefresh({
      triggeredBy: trigger,
      webhookUrl: buildWebhookUrl(req),
    });
    return Response.json({
      kicked: true,
      mode: "async",
      ...result,
      message:
        "Apify actor started. Webhook will populate the database in 5-15 min.",
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "kick failed" },
      { status: 500 },
    );
  }
}

// GET used by Vercel Cron dashboard for uptime check
export async function GET(req: NextRequest) {
  return POST(req);
}
