/**
 * Thin wrapper around Apify's `memo23/streeteasy-ppr` actor.
 *
 * We call the actor via the official REST API (no SDK, to keep deps small).
 * Docs: https://docs.apify.com/platform/schedules/run
 */

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_ACTOR = process.env.APIFY_ACTOR || "memo23/streeteasy-ppr";
const APIFY_BASE = "https://api.apify.com/v2";

export class ApifyFetchError extends Error {}

export interface ApifyActorItem {
  // Mirror the raw JSON keys we consume in parser.ts.
  // We type loosely — actor schema is stable but wide.
  [k: string]: unknown;
}

function actorPath(): string {
  // Apify REST uses `~` in place of `/` for actor IDs in URLs.
  return APIFY_ACTOR.replace("/", "~");
}

async function startRun(urls: string[]): Promise<string> {
  if (!APIFY_TOKEN) throw new ApifyFetchError("APIFY_API_TOKEN not set");
  const res = await fetch(
    `${APIFY_BASE}/acts/${actorPath()}/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ startUrls: urls.map((u) => ({ url: u })) }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new ApifyFetchError(`actor start ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { data?: { id?: string } };
  const runId = json.data?.id;
  if (!runId) throw new ApifyFetchError("missing run id in start response");
  return runId;
}

/**
 * Kick off an Apify actor run and register a per-run webhook so Apify pings
 * us back when it finishes. Returns the runId immediately — does NOT poll.
 *
 * Used by the cron handler so Vercel's 5-minute serverless ceiling no longer
 * matters: cron just kicks off the run and returns; the webhook handler picks
 * up the dataset later.
 *
 * The webhook fires for ACTOR.RUN.SUCCEEDED, FAILED, ABORTED, and TIMED-OUT.
 */
export async function startRunWithWebhook(
  urls: string[],
  webhookRequestUrl: string,
): Promise<string> {
  if (!APIFY_TOKEN) throw new ApifyFetchError("APIFY_API_TOKEN not set");
  const deduped = Array.from(new Set(urls.filter(Boolean)));
  if (deduped.length === 0) throw new ApifyFetchError("no urls supplied");

  const body = {
    startUrls: deduped.map((u) => ({ url: u })),
    webhooks: [
      {
        eventTypes: [
          "ACTOR.RUN.SUCCEEDED",
          "ACTOR.RUN.FAILED",
          "ACTOR.RUN.ABORTED",
          "ACTOR.RUN.TIMED_OUT",
        ],
        requestUrl: webhookRequestUrl,
        // Apify substitutes these placeholders before POSTing — we use them
        // in the webhook handler to find the dataset and refresh-run row.
        payloadTemplate: JSON.stringify({
          eventType: "{{eventType}}",
          actorRunId: "{{resource.id}}",
          status: "{{resource.status}}",
          defaultDatasetId: "{{resource.defaultDatasetId}}",
        }),
      },
    ],
  };

  const res = await fetch(
    `${APIFY_BASE}/acts/${actorPath()}/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new ApifyFetchError(`actor start ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { data?: { id?: string } };
  const runId = json.data?.id;
  if (!runId) throw new ApifyFetchError("missing run id in start response");
  return runId;
}

/** Look up an Apify run's dataset id post-hoc (used by the webhook handler). */
export async function getRunDatasetId(runId: string): Promise<string | null> {
  if (!APIFY_TOKEN) throw new ApifyFetchError("APIFY_API_TOKEN not set");
  const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { defaultDatasetId?: string; status?: string };
  };
  return json.data?.defaultDatasetId ?? null;
}

/** Public wrapper around the dataset fetcher for use by the webhook handler. */
export async function fetchDatasetItems(datasetId: string): Promise<ApifyActorItem[]> {
  return fetchDataset(datasetId);
}

async function waitForRun(runId: string, maxWaitMs = 600_000): Promise<{ datasetId: string; cost?: number }> {
  const deadline = Date.now() + maxWaitMs;
  let interval = 2000;
  while (Date.now() < deadline) {
    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    if (!res.ok) throw new ApifyFetchError(`run status ${res.status}`);
    const json = (await res.json()) as {
      data?: { status?: string; defaultDatasetId?: string; stats?: { computeUnits?: number } };
    };
    const status = json.data?.status;
    if (status === "SUCCEEDED") {
      const datasetId = json.data?.defaultDatasetId;
      if (!datasetId) throw new ApifyFetchError("finished but no defaultDatasetId");
      return { datasetId };
    }
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new ApifyFetchError(`run ended with status=${status}`);
    }
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval * 1.4, 8000);
  }
  throw new ApifyFetchError(`run ${runId} did not complete within ${maxWaitMs}ms`);
}

async function fetchDataset(datasetId: string): Promise<ApifyActorItem[]> {
  const res = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true&format=json`
  );
  if (!res.ok) throw new ApifyFetchError(`dataset fetch ${res.status}`);
  return (await res.json()) as ApifyActorItem[];
}

/**
 * Run actor against `urls` and return one dict per resolved building.
 * Single actor run; no batching (PPR has no per-run cap).
 */
export async function fetchBuildings(urls: string[]): Promise<ApifyActorItem[]> {
  const deduped = Array.from(new Set(urls.filter(Boolean)));
  if (deduped.length === 0) return [];
  const runId = await startRun(deduped);
  const { datasetId } = await waitForRun(runId);
  return fetchDataset(datasetId);
}

/** PPR cost estimate: $3.50 per 1k results → 350 cents / 1000 = 0.35 cents / result. */
export function estimateCostCents(resultCount: number): number {
  return Math.round(resultCount * 0.35);
}
