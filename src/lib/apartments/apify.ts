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
