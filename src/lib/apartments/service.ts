/**
 * Server-side helpers that talk to Supabase (service-role) to persist the
 * results of an Apify scan. Used by /api/apartments/cron/refresh and the
 * migration script.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { HOT_BUILDINGS, buildingUrlForSeed } from "./hot_buildings";
import {
  fetchBuildings,
  estimateCostCents,
  ApifyFetchError,
  startRunWithWebhook,
  fetchDatasetItems,
} from "./apify";
import { parseApifyItem } from "./parser";
import type { ParsedBuilding, ParsedListing, HotBuildingSeed } from "./types";
import { fetchHtml, ScrapingBeeError } from "./scrapingbee";
import { parseAvailableAt, parseBuildingPage } from "./rsc-parser";

export interface RefreshResult {
  runId: string;
  status: "ok" | "blocked" | "error";
  buildings_requested: number;
  buildings_fetched: number;
  listings_upserted: number;
  listings_new: number;
  listings_inactivated: number;
  cost_cents_estimate: number;
  error?: string;
}

/**
 * Seed / upsert the curated catalog into apt_buildings. Non-destructive:
 * preserves `note`, `is_tracked`, and per-run `last_fetched_at` — updates
 * only the static seed fields.
 */
export async function seedCatalogIfNeeded(admin?: SupabaseClient): Promise<number> {
  const db = admin ?? getSupabaseAdmin();
  // Only insert seed rows for buildings that don't yet exist by slug.
  // Avoids piling up orphan placeholders when Apify already populated a real row.
  const slugs = HOT_BUILDINGS.map((b) => b.buildingSlug).filter(Boolean);
  const { data: existing } = await db
    .from("apt_buildings")
    .select("building_slug")
    .in("building_slug", slugs);
  const have = new Set((existing ?? []).map((r: { building_slug: string }) => r.building_slug));

  const rows = HOT_BUILDINGS.filter((b) => !have.has(b.buildingSlug)).map((b) => ({
    id: placeholderIdForSeed(b),
    name: b.name,
    short_name: b.shortName ?? null,
    address: b.address,
    neighborhood: b.neighborhood ?? null,
    borough: b.borough ?? null,
    area: b.area,
    tag: b.tag,
    building_url: buildingUrlForSeed(b),
    building_slug: b.buildingSlug,
    note: b.note ?? null,
    is_tracked: true,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return 0;
  const { error } = await db.from("apt_buildings").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`seedCatalog failed: ${error.message}`);
  return rows.length;
}

/** Placeholder id used before the first Apify call returns the real building_id. */
function placeholderIdForSeed(b: HotBuildingSeed): string {
  return `seed:${b.buildingSlug}`;
}

/**
 * Pick the right `area` slot from the borough/neighborhood/url that Apify
 * returns. The seed catalog used to be the source of truth here, but a stale
 * seed lookup defaulted everything to "lic" — so we now prefer Apify's actual
 * borough and only fall back to the seed when Apify gives us nothing usable.
 */
function deriveAreaFromBorough(
  borough: string | null | undefined,
  neighborhood: string | null | undefined,
  buildingUrl: string | null | undefined,
): string | null {
  const b = (borough ?? "").toLowerCase();
  const n = (neighborhood ?? "").toLowerCase();
  const url = (buildingUrl ?? "").toLowerCase();
  if (b === "manhattan") return "manhattan";
  if (b === "brooklyn") return "brooklyn";
  if (b === "queens") {
    return n.includes("long island city") ? "lic" : "queens";
  }
  // Out-of-NYC (Apify returns null borough for Jersey City etc.)
  if (url.includes("jersey") || url.includes("hoboken")) return "jersey_city";
  return null;
}

interface UpsertPayload {
  building: ParsedBuilding;
  listings: ParsedListing[];
}

async function upsertBuildingAndListings(
  db: SupabaseClient,
  payload: UpsertPayload
): Promise<{ listings_upserted: number; listings_new: number }> {
  const { building, listings } = payload;
  // First: see if there's a seed row matching the building URL. If so,
  // replace its `id` with the real building_id.
  const seedHit = HOT_BUILDINGS.find(
    (s) => buildingUrlForSeed(s) === building.building_url
  );
  if (seedHit) {
    const seedId = placeholderIdForSeed(seedHit);
    if (seedId !== building.id) {
      await db.from("apt_buildings").delete().eq("id", seedId);
    }
  }

  // area: HOT_BUILDINGS seed is the source of truth (it knows that "Hunters
  // Point" sub-neighborhood = LIC, that Journal Squared is JC despite Apify
  // returning borough=null, etc.). Only fall back to borough-derivation if the
  // seed match failed (e.g. an out-of-catalog building got tracked manually).
  const derivedArea = deriveAreaFromBorough(building.borough, building.neighborhood, building.building_url);
  const finalArea = seedHit?.area ?? derivedArea ?? "lic";

  const bldgRow = {
    id: building.id,
    name: building.name,
    address: building.address,
    neighborhood: building.neighborhood,
    borough: building.borough,
    area: finalArea,
    tag: seedHit?.tag ?? "core",
    building_url: building.building_url,
    building_slug: seedHit?.buildingSlug ?? null,
    official_url: building.official_url,
    leasing_phone: building.leasing_phone,
    leasing_company: building.leasing_company,
    year_built: building.year_built,
    floor_count: building.floor_count,
    unit_count: building.unit_count,
    active_rentals_count: building.active_rentals_count,
    open_rentals_count: building.open_rentals_count,
    closed_rentals_count: building.closed_rentals_count,
    is_new_development: building.is_new_development,
    image_url: building.image_url,
    amenities: building.amenities,
    subways: building.subways,
    schools: building.schools,
    description: building.description,
    latitude: building.latitude,
    longitude: building.longitude,
    note: seedHit?.note ?? null,
    is_tracked: true,
    last_fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error: bErr } = await db.from("apt_buildings").upsert(bldgRow, { onConflict: "id" });
  if (bErr) throw new Error(`upsert building failed: ${bErr.message}`);

  if (listings.length === 0) return { listings_upserted: 0, listings_new: 0 };

  // Count how many of these ids are new (not yet in table)
  const ids = listings.map((l) => l.id);
  const { data: existing } = await db
    .from("apt_listings")
    .select("id")
    .in("id", ids);
  const existingSet = new Set((existing ?? []).map((r: { id: string }) => r.id));
  const listings_new = listings.filter((l) => !existingSet.has(l.id)).length;

  const rows = listings.map((l) => ({
    ...l,
    is_active: true,
    last_seen_at: new Date().toISOString(),
    source: "apify",
  }));
  const { error: lErr } = await db.from("apt_listings").upsert(rows, { onConflict: "id" });
  if (lErr) throw new Error(`upsert listings failed: ${lErr.message}`);

  return { listings_upserted: listings.length, listings_new };
}

/**
 * Write today's per-building aggregate snapshot. Idempotent — re-running same
 * day overwrites the row (PK is building_id + snapshot_date).
 *
 * Fed only by the daily cron's `runRefresh` (or manual trigger). Failure is
 * logged but never blocks the main listing upsert.
 */
async function writeBuildingSnapshots(db: SupabaseClient): Promise<number> {
  // Pull all tracked buildings + their currently-active listings in one go
  const { data: bldgs, error: bErr } = await db
    .from("apt_buildings")
    .select("id, active_rentals_count, open_rentals_count")
    .eq("is_tracked", true);
  if (bErr) {
    console.warn("snapshot: building fetch failed", bErr.message);
    return 0;
  }
  const ids = (bldgs ?? []).map((b: { id: string }) => b.id);
  if (ids.length === 0) return 0;

  const { data: listings, error: lErr } = await db
    .from("apt_listings")
    .select("building_id, bedrooms, price_monthly, months_free")
    .in("building_id", ids)
    .eq("is_active", true);
  if (lErr) {
    console.warn("snapshot: listing fetch failed", lErr.message);
    return 0;
  }

  const today = new Date().toISOString().slice(0, 10);
  const byBuilding = new Map<string, Array<{ bedrooms: number | null; price_monthly: number | null; months_free: number | null }>>();
  for (const l of listings ?? []) {
    const arr = byBuilding.get(l.building_id) ?? [];
    arr.push(l);
    byBuilding.set(l.building_id, arr);
  }

  const rows = (bldgs ?? []).map((b: { id: string; active_rentals_count: number | null; open_rentals_count: number | null }) => {
    const ls = byBuilding.get(b.id) ?? [];
    const buckets: Record<string, number[]> = {};
    let totalConcessionMonths = 0;
    let concessionDenom = 0;
    for (const l of ls) {
      if (l.bedrooms != null && l.price_monthly != null) {
        const k = String(l.bedrooms);
        (buckets[k] = buckets[k] ?? []).push(l.price_monthly);
      }
      if (l.months_free != null) {
        totalConcessionMonths += l.months_free;
        concessionDenom++;
      }
    }
    const median: Record<string, number> = {};
    for (const [k, arr] of Object.entries(buckets)) {
      arr.sort((a, b) => a - b);
      const mid = Math.floor(arr.length / 2);
      median[k] = arr.length % 2 === 0 ? Math.round((arr[mid - 1] + arr[mid]) / 2) : arr[mid];
    }
    return {
      building_id: b.id,
      snapshot_date: today,
      active_count: ls.length,
      open_rentals_count: b.open_rentals_count ?? b.active_rentals_count,
      median_price_by_beds: median,
      avg_months_free: concessionDenom > 0 ? Number((totalConcessionMonths / concessionDenom).toFixed(2)) : null,
      snapshot_at: new Date().toISOString(),
    };
  });

  const { error: upErr } = await db
    .from("apt_building_snapshots")
    .upsert(rows, { onConflict: "building_id,snapshot_date" });
  if (upErr) {
    console.warn("snapshot: upsert failed", upErr.message);
    return 0;
  }
  return rows.length;
}

/** Anything unseen in the last `hours` hours is marked inactive. */
async function markStaleInactive(db: SupabaseClient, hours = 48): Promise<number> {
  const threshold = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data, error } = await db
    .from("apt_listings")
    .update({ is_active: false })
    .lt("last_seen_at", threshold)
    .eq("is_active", true)
    .select("id");
  if (error) throw new Error(`mark inactive failed: ${error.message}`);
  return (data ?? []).length;
}

/** Full refresh cycle: fetch → parse → upsert → stale-sweep → log. */
export async function runRefresh(opts: {
  triggeredBy: "cron" | "manual" | "migration";
  buildingUrls?: string[];
}): Promise<RefreshResult> {
  const db = getSupabaseAdmin();
  const urls =
    opts.buildingUrls ??
    HOT_BUILDINGS.filter((b) => (b.area as string) !== "legacy" && b.buildingSlug).map(buildingUrlForSeed);

  await seedCatalogIfNeeded(db);

  const { data: runInsert, error: runInsertErr } = await db
    .from("apt_refresh_runs")
    .insert({
      status: "running",
      buildings_requested: urls.length,
      triggered_by: opts.triggeredBy,
    })
    .select("id")
    .single();
  if (runInsertErr) throw new Error(`create run log: ${runInsertErr.message}`);
  const runId = runInsert!.id as string;

  let status: RefreshResult["status"] = "ok";
  let errorMsg: string | undefined;
  let buildings_fetched = 0;
  let listings_upserted = 0;
  let listings_new = 0;
  let listings_inactivated = 0;

  try {
    const items = await fetchBuildings(urls);
    buildings_fetched = items.length;
    for (const item of items) {
      try {
        const parsed = parseApifyItem(item);
        if (!parsed.building.id) continue;
        const r = await upsertBuildingAndListings(db, parsed);
        listings_upserted += r.listings_upserted;
        listings_new += r.listings_new;
      } catch (e) {
        console.warn("apartments: parse/upsert failed for item", e);
      }
    }
    listings_inactivated = await markStaleInactive(db, 48);
    // Write today's snapshot for trend tracking. Wrapped — failures here
    // shouldn't fail the main refresh.
    try {
      const n = await writeBuildingSnapshots(db);
      console.log(`apartments: wrote ${n} building snapshots`);
    } catch (e) {
      console.warn("apartments: snapshot write failed (non-fatal):", e);
    }
  } catch (e) {
    if (e instanceof ApifyFetchError) {
      status = /blocked|captcha/i.test(e.message) ? "blocked" : "error";
    } else {
      status = "error";
    }
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const cost = estimateCostCents(buildings_fetched);
  await db
    .from("apt_refresh_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      buildings_fetched,
      listings_upserted,
      listings_new,
      listings_inactivated,
      cost_cents_estimate: cost,
      error_message: errorMsg ?? null,
    })
    .eq("id", runId);

  return {
    runId,
    status,
    buildings_requested: urls.length,
    buildings_fetched,
    listings_upserted,
    listings_new,
    listings_inactivated,
    cost_cents_estimate: cost,
    error: errorMsg,
  };
}

// --------------------------------------------------------------------- //
//                    Webhook-driven (async) refresh                     //
// --------------------------------------------------------------------- //
//
// New flow that bypasses Vercel's 5-minute serverless ceiling:
//   1. cron route   → kickRefresh()        starts Apify, returns < 1s
//   2. Apify finishes → POSTs our webhook   (5-15 min later)
//   3. webhook route → processFinishedRun()  fetches dataset, upserts, marks ok
//
// Compared to runRefresh() above (which polls Apify in-process), this
// pattern only requires Vercel to be alive for tiny bursts at start + end.
//

export interface KickRefreshResult {
  refreshRunId: string;
  apifyRunId: string;
  buildingsRequested: number;
}

/**
 * Start an Apify scrape and register a webhook to call us back when it
 * finishes. Returns immediately. The DB row for this run is created in
 * status='running' with apify_run_id populated.
 */
export async function kickRefresh(opts: {
  triggeredBy: "cron" | "manual" | "migration";
  webhookUrl: string;
  buildingUrls?: string[];
}): Promise<KickRefreshResult> {
  const db = getSupabaseAdmin();
  const urls =
    opts.buildingUrls ??
    HOT_BUILDINGS.filter((b) => (b.area as string) !== "legacy" && b.buildingSlug).map(buildingUrlForSeed);

  await seedCatalogIfNeeded(db);

  const apifyRunId = await startRunWithWebhook(urls, opts.webhookUrl);

  const { data: runInsert, error: runInsertErr } = await db
    .from("apt_refresh_runs")
    .insert({
      status: "running",
      buildings_requested: urls.length,
      triggered_by: opts.triggeredBy,
      apify_run_id: apifyRunId,
    })
    .select("id")
    .single();
  if (runInsertErr) throw new Error(`create run log: ${runInsertErr.message}`);

  return {
    refreshRunId: runInsert!.id as string,
    apifyRunId,
    buildingsRequested: urls.length,
  };
}

/**
 * Called by the webhook handler when Apify finishes a run. Fetches the
 * dataset, parses + upserts, then updates the matching apt_refresh_runs row.
 *
 * Idempotent: if the row is already 'ok' we skip (Apify may retry the
 * webhook and we don't want double-counted stats).
 */
export async function processFinishedRun(opts: {
  apifyRunId: string;
  status: "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED_OUT" | string;
  defaultDatasetId?: string | null;
}): Promise<RefreshResult> {
  const db = getSupabaseAdmin();

  // Find the matching refresh-run row (we store apify_run_id at kick time)
  const { data: runRow, error: lookupErr } = await db
    .from("apt_refresh_runs")
    .select("id, status, buildings_requested")
    .eq("apify_run_id", opts.apifyRunId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookupErr) throw new Error(`lookup run row: ${lookupErr.message}`);
  if (!runRow) {
    throw new Error(`no refresh_run row matches apify_run_id=${opts.apifyRunId}`);
  }
  if (runRow.status === "ok") {
    // Already processed (idempotent retry)
    return {
      runId: runRow.id as string,
      status: "ok",
      buildings_requested: runRow.buildings_requested ?? 0,
      buildings_fetched: 0,
      listings_upserted: 0,
      listings_new: 0,
      listings_inactivated: 0,
      cost_cents_estimate: 0,
    };
  }

  let status: RefreshResult["status"] = "ok";
  let errorMsg: string | undefined;
  let buildings_fetched = 0;
  let listings_upserted = 0;
  let listings_new = 0;
  let listings_inactivated = 0;

  // Apify reported non-success terminal states
  if (opts.status !== "SUCCEEDED") {
    status = "error";
    errorMsg = `Apify run ended with status=${opts.status}`;
  } else if (!opts.defaultDatasetId) {
    status = "error";
    errorMsg = "Apify success webhook missing defaultDatasetId";
  } else {
    try {
      const items = await fetchDatasetItems(opts.defaultDatasetId);
      buildings_fetched = items.length;
      for (const item of items) {
        try {
          const parsed = parseApifyItem(item);
          if (!parsed.building.id) continue;
          const r = await upsertBuildingAndListings(db, parsed);
          listings_upserted += r.listings_upserted;
          listings_new += r.listings_new;
        } catch (e) {
          console.warn("apartments: parse/upsert failed for item", e);
        }
      }
      listings_inactivated = await markStaleInactive(db, 48);
      try {
        const n = await writeBuildingSnapshots(db);
        console.log(`apartments: wrote ${n} building snapshots`);
      } catch (e) {
        console.warn("apartments: snapshot write failed (non-fatal):", e);
      }
    } catch (e) {
      if (e instanceof ApifyFetchError) {
        status = "error";
      } else {
        status = "error";
      }
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  const cost = estimateCostCents(buildings_fetched);
  await db
    .from("apt_refresh_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      buildings_fetched,
      listings_upserted,
      listings_new,
      listings_inactivated,
      cost_cents_estimate: cost,
      error_message: errorMsg ?? null,
    })
    .eq("id", runRow.id);

  return {
    runId: runRow.id as string,
    status,
    buildings_requested: runRow.buildings_requested ?? 0,
    buildings_fetched,
    listings_upserted,
    listings_new,
    listings_inactivated,
    cost_cents_estimate: cost,
    error: errorMsg,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ScrapingBee 分支 —— 新架构（替代 Apify）
//
//  设计：
//   - 同步拉取：Vercel Function 一次请求跑完所有 tracked buildings（并发分批）
//   - 数据来源：apt_buildings.is_tracked = true 的楼盘（DB 为列表权威）
//   - 字段范围：listings 全量 + building 动态字段（active_rentals_count 等）
//     静态字段（year_built / amenities 等）仅在首次 seed 或 row 缺字段时填
//   - 跳过的字段：sqft / floor_plan_url / no_fee / 完整描述 / 图库
//     → 由前端通过 listing.url 外链到 StreetEasy，用户自己看
// ═══════════════════════════════════════════════════════════════════════════

/** 并发批次大小（ScrapingBee 并发建议 5-10；默认 5 保守） */
const SCRAPINGBEE_CONCURRENCY = 5;

export interface ScrapingBeeRefreshResult {
  runId: string;
  status: "ok" | "error";
  buildings_requested: number;
  buildings_fetched: number;
  listings_upserted: number;
  listings_new: number;
  listings_inactivated: number;
  /** 每栋 25 credits，按 credits 估价反映到 cost_cents（1 credit ≈ 0.049 cent on Freelance plan） */
  cost_cents_estimate: number;
  /** 每栋 building 的拉取状态，含失败原因 */
  per_building: Array<{
    building_id: string;
    building_url: string;
    ok: boolean;
    listings_count: number;
    error?: string;
  }>;
  error?: string;
}

interface TrackedBuilding {
  id: string;
  building_url: string;
  building_slug: string | null;
}

/**
 * 从 apt_buildings 读 is_tracked=true 的楼盘列表作为当日抓取任务。
 * 这是 watchlist 机制的实现：不再 hardcode URL。
 */
async function loadTrackedBuildings(db: SupabaseClient): Promise<TrackedBuilding[]> {
  const { data, error } = await db
    .from("apt_buildings")
    .select("id, building_url, building_slug")
    .eq("is_tracked", true)
    .not("building_url", "is", null);
  if (error) throw new Error(`load tracked buildings: ${error.message}`);
  return (data ?? []) as TrackedBuilding[];
}

/**
 * 抓 + 解析 + 对当前这栋 building 做 DB 写入（listings upsert + 动态字段）。
 * 不抛异常，失败通过返回值报告。
 */
async function processBuildingViaScrapingBee(
  db: SupabaseClient,
  b: TrackedBuilding,
): Promise<ScrapingBeeRefreshResult["per_building"][number]> {
  try {
    const html = await fetchHtml(b.building_url);
    const parsed = parseBuildingPage(html);

    const nowIso = new Date().toISOString();

    // 1) upsert listings
    if (parsed.listings.length > 0) {
      const listingRows = parsed.listings.map((l) => ({
        id: l.id,
        building_id: b.id,
        url: l.url,
        unit: l.unit,
        address: null,
        neighborhood: null,
        borough: null,
        price_monthly: l.price_monthly,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        sqft: null, // 有意留空：用户点 url 外链看
        no_fee: false,
        is_featured: false,
        furnished: l.furnished,
        available_at: parseAvailableAt(l.available_at_raw),
        months_free: l.months_free,
        lease_term_months: l.lease_term_months,
        image_url: l.image_url,
        floor_plan_url: null, // 同上：外链看
        listing_type: l.listing_type.toLowerCase(),
        last_seen_at: nowIso,
        is_active: l.is_active,
        source: "scrapingbee",
      }));
      const { error: lErr } = await db
        .from("apt_listings")
        .upsert(listingRows, { onConflict: "id" });
      if (lErr) throw new Error(`upsert listings: ${lErr.message}`);
    }

    // 2) 动态 building 字段（每日更新）
    const activeCount = parsed.dynamic.active_rentals_count;
    const openCount = parsed.dynamic.open_rentals_count;

    // 3) 静态字段——仅在 row 缺字段时填补（保留已有值，防止覆盖人工修订）
    const { data: curr } = await db
      .from("apt_buildings")
      .select("year_built, floor_count, unit_count, amenities, latitude, longitude, developer, leasing_company, official_url, description, image_url")
      .eq("id", b.id)
      .maybeSingle();

    const updates: Record<string, unknown> = {
      active_rentals_count: activeCount,
      open_rentals_count: openCount,
      last_fetched_at: nowIso,
      updated_at: nowIso,
    };
    if (!curr?.year_built && parsed.static.year_built) updates.year_built = parsed.static.year_built;
    if (!curr?.floor_count && parsed.static.floor_count) updates.floor_count = parsed.static.floor_count;
    if (!curr?.unit_count && parsed.static.unit_count) updates.unit_count = parsed.static.unit_count;
    if (!curr?.latitude && parsed.static.latitude) updates.latitude = parsed.static.latitude;
    if (!curr?.longitude && parsed.static.longitude) updates.longitude = parsed.static.longitude;
    if (!curr?.developer && parsed.static.developer) updates.developer = parsed.static.developer;
    if (!curr?.leasing_company && parsed.static.leasing_company) updates.leasing_company = parsed.static.leasing_company;
    if (!curr?.official_url && parsed.static.official_url) updates.official_url = parsed.static.official_url;
    if (!curr?.description && parsed.static.description) updates.description = parsed.static.description;
    if (!curr?.image_url && parsed.static.image_url) updates.image_url = parsed.static.image_url;
    if ((!curr?.amenities || (curr.amenities as string[]).length === 0) && parsed.static.amenities.length > 0) {
      updates.amenities = parsed.static.amenities;
    }

    const { error: bErr } = await db
      .from("apt_buildings")
      .update(updates)
      .eq("id", b.id);
    if (bErr) throw new Error(`update building dynamics: ${bErr.message}`);

    return {
      building_id: b.id,
      building_url: b.building_url,
      ok: true,
      listings_count: parsed.listings.length,
    };
  } catch (e) {
    return {
      building_id: b.id,
      building_url: b.building_url,
      ok: false,
      listings_count: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 失效过时 listings：本轮刷新成功的 building 下，is_active=true 但 last_seen_at
 * 早于 1 天前 —— 说明这一轮没再出现，视为下架。
 * 只作用于本轮刷到的 building，失败的 building 的 listings 不会被误杀。
 */
async function inactivateStaleListings(
  db: SupabaseClient,
  refreshedBuildingIds: string[],
  staleThresholdIso: string,
): Promise<number> {
  if (refreshedBuildingIds.length === 0) return 0;
  const { data, error } = await db
    .from("apt_listings")
    .update({ is_active: false })
    .in("building_id", refreshedBuildingIds)
    .eq("is_active", true)
    .lt("last_seen_at", staleThresholdIso)
    .select("id");
  if (error) {
    console.warn("[scrapingbee refresh] inactivate stale failed", error.message);
    return 0;
  }
  return (data ?? []).length;
}

/**
 * ScrapingBee 主刷新入口。直接同步跑完所有 tracked buildings，返回结果。
 * 启动阶段（env / DB 初始化）的致命错误会抛出；处理单栋楼盘的异常被吞在内部
 * 并反映在 per_building 数组里，确保"一栋挂不影响其他栋"。
 */
export async function refreshViaScrapingBee(opts: {
  triggeredBy: "cron" | "manual";
  /** 可选：显式指定 building_url 列表，否则读 DB is_tracked=true */
  onlyUrls?: string[];
}): Promise<ScrapingBeeRefreshResult> {
  const db = getSupabaseAdmin();

  if (!process.env.SCRAPINGBEE_API_KEY) {
    throw new Error("SCRAPINGBEE_API_KEY 未设置");
  }

  // 1) 建立 refresh_runs 行
  const { data: runRow, error: runErr } = await db
    .from("apt_refresh_runs")
    .insert({
      status: "running",
      triggered_by: opts.triggeredBy,
      buildings_requested: 0,
    })
    .select("id")
    .single();
  if (runErr) throw new Error(`create run log: ${runErr.message}`);
  const runId = runRow!.id as string;

  // 2) 确定 tracked 楼盘列表
  let buildings = await loadTrackedBuildings(db);
  if (opts.onlyUrls && opts.onlyUrls.length > 0) {
    const allow = new Set(opts.onlyUrls);
    buildings = buildings.filter((b) => allow.has(b.building_url));
  }

  await db
    .from("apt_refresh_runs")
    .update({ buildings_requested: buildings.length })
    .eq("id", runId);

  // 3) 分批并发抓取 + upsert
  const results: ScrapingBeeRefreshResult["per_building"] = [];
  for (let i = 0; i < buildings.length; i += SCRAPINGBEE_CONCURRENCY) {
    const batch = buildings.slice(i, i + SCRAPINGBEE_CONCURRENCY);
    const batchRes = await Promise.all(batch.map((b) => processBuildingViaScrapingBee(db, b)));
    results.push(...batchRes);
  }

  // 4) 失效过时 listings
  const refreshedOkIds = results.filter((r) => r.ok).map((r) => r.building_id);
  const staleThreshold = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const inactivated = await inactivateStaleListings(db, refreshedOkIds, staleThreshold);

  // 5) 汇总统计
  const buildings_fetched = results.filter((r) => r.ok).length;
  const listings_upserted = results.reduce((sum, r) => sum + r.listings_count, 0);
  const costCreditsTotal = buildings.length * 25;
  const cost_cents_estimate = Math.round(costCreditsTotal * 0.049); // Freelance $49 / 100k credits ≈ 0.049c/credit

  const overallStatus = buildings_fetched === 0 && buildings.length > 0 ? "error" : "ok";
  const errorMsg =
    overallStatus === "error"
      ? `All ${buildings.length} buildings failed. First: ${results[0]?.error ?? "unknown"}`
      : null;

  // 6) 写回 run 行
  await db
    .from("apt_refresh_runs")
    .update({
      status: overallStatus,
      finished_at: new Date().toISOString(),
      buildings_fetched,
      listings_upserted,
      listings_new: 0, // TODO: 精确区分 new 需额外查 existing listing ids
      listings_inactivated: inactivated,
      cost_cents_estimate,
      error_message: errorMsg,
    })
    .eq("id", runId);

  return {
    runId,
    status: overallStatus,
    buildings_requested: buildings.length,
    buildings_fetched,
    listings_upserted,
    listings_new: 0,
    listings_inactivated: inactivated,
    cost_cents_estimate,
    per_building: results,
    error: errorMsg ?? undefined,
  };
}
