import { NextRequest } from "next/server";
import { processFinishedRun } from "@/lib/apartments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Dataset fetch + 36 building upserts is fast (we've measured 10-30s end to
// end), but pad the budget to absorb Supabase hiccups.
export const maxDuration = 120;

/**
 * Receives the per-run webhook Apify pings when an actor run terminates.
 *
 * Auth: shared CRON_SECRET in `?secret=...` query string. Apify supports
 * HMAC signing too, but query-secret is fine here — the URL is only ever
 * sent to Apify (not logged), and the secret is also rotated whenever
 * CRON_SECRET is.
 *
 * Apify webhook payload (set by payloadTemplate in apify.ts::startRunWithWebhook):
 *   {
 *     eventType: "ACTOR.RUN.SUCCEEDED",
 *     actorRunId: "...",
 *     status: "SUCCEEDED",
 *     defaultDatasetId: "..."
 *   }
 */
function authed(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.nextUrl.searchParams.get("secret") === expected;
}

interface WebhookPayload {
  eventType?: string;
  actorRunId?: string;
  status?: string;
  defaultDatasetId?: string | null;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return new Response("unauthorized", { status: 401 });
  let body: WebhookPayload;
  try {
    body = (await req.json()) as WebhookPayload;
  } catch {
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }
  if (!body.actorRunId) {
    return Response.json({ error: "missing actorRunId" }, { status: 400 });
  }
  try {
    const result = await processFinishedRun({
      apifyRunId: body.actorRunId,
      status: body.status ?? "UNKNOWN",
      defaultDatasetId: body.defaultDatasetId ?? null,
    });
    return Response.json(result);
  } catch (e) {
    // Return 500 so Apify retries — the webhook system retries with
    // exponential backoff on non-2xx responses.
    return Response.json(
      { error: e instanceof Error ? e.message : "webhook handler failed" },
      { status: 500 },
    );
  }
}
