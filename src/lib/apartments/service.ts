/**
 * Server-side helpers that talk to Supabase (service-role) to persist the
 * results of an Apify scan. Used by /api/apartments/cron/refresh and the
 * migration script.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { HOT_BUILDINGS, buildingUrlForSeed } from "./hot_buildings";
import { fetchBuildings, estimateCostCents, ApifyFetchError } from "./apify";
import { parseApifyItem } from "./parser";
import type { ParsedBuilding, ParsedListing, HotBuildingSeed } from "./types";

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
  const rows = HOT_BUILDINGS.map((b) => ({
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
  // Use upsert on `building_slug` uniqueness ... actually PK is `id`.
  // We use `building_slug` as a stable placeholder id until the real
  // StreetEasy numeric building_id arrives via a refresh.
  const { error } = await db.from("apt_buildings").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`seedCatalog failed: ${error.message}`);
  return rows.length;
}

/** Placeholder id used before the first Apify call returns the real building_id. */
function placeholderIdForSeed(b: HotBuildingSeed): string {
  return `seed:${b.buildingSlug}`;
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

  const bldgRow = {
    id: building.id,
    name: building.name,
    address: building.address,
    neighborhood: building.neighborhood,
    borough: building.borough,
    area: seedHit?.area ?? "lic",
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
    HOT_BUILDINGS.filter((b) => b.area !== "legacy" && b.buildingSlug).map(buildingUrlForSeed);

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
