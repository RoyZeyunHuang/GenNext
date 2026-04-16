/**
 * Read helpers for apt_building_snapshots — used by the building detail
 * page to render the 30-day trend sparkline.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface BuildingSnapshotRow {
  building_id: string;
  snapshot_date: string;        // YYYY-MM-DD
  active_count: number | null;
  open_rentals_count: number | null;
  median_price_by_beds: Record<string, number> | null;
  avg_months_free: number | null;
}

export async function getRecentSnapshots(
  db: SupabaseClient,
  buildingId: string,
  days = 30,
): Promise<BuildingSnapshotRow[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("apt_building_snapshots")
    .select("building_id, snapshot_date, active_count, open_rentals_count, median_price_by_beds, avg_months_free")
    .eq("building_id", buildingId)
    .gte("snapshot_date", since)
    .order("snapshot_date", { ascending: true });
  if (error) return [];
  return (data ?? []) as BuildingSnapshotRow[];
}

/**
 * Backfill one row for today if missing — useful so a brand-new building's
 * detail page isn't empty before the cron writes its first snapshot.
 */
export async function ensureTodaySnapshot(
  db: SupabaseClient,
  buildingId: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await db
    .from("apt_building_snapshots")
    .select("building_id")
    .eq("building_id", buildingId)
    .eq("snapshot_date", today)
    .maybeSingle();
  if (existing) return;
  // Build a one-off snapshot from current state
  const { data: bldg } = await db
    .from("apt_buildings")
    .select("active_rentals_count, open_rentals_count")
    .eq("id", buildingId)
    .maybeSingle();
  const { data: ls } = await db
    .from("apt_listings")
    .select("bedrooms, price_monthly, months_free")
    .eq("building_id", buildingId)
    .eq("is_active", true);
  const buckets: Record<string, number[]> = {};
  let conSum = 0, conN = 0;
  for (const l of (ls ?? [])) {
    if (l.bedrooms != null && l.price_monthly != null) {
      const k = String(l.bedrooms);
      (buckets[k] = buckets[k] ?? []).push(l.price_monthly);
    }
    if (l.months_free != null) { conSum += l.months_free; conN++; }
  }
  const median: Record<string, number> = {};
  for (const [k, arr] of Object.entries(buckets)) {
    arr.sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    median[k] = arr.length % 2 === 0 ? Math.round((arr[mid - 1] + arr[mid]) / 2) : arr[mid];
  }
  await db.from("apt_building_snapshots").upsert({
    building_id: buildingId,
    snapshot_date: today,
    active_count: (ls ?? []).length,
    open_rentals_count: bldg?.open_rentals_count ?? bldg?.active_rentals_count ?? null,
    median_price_by_beds: median,
    avg_months_free: conN > 0 ? Number((conSum / conN).toFixed(2)) : null,
    snapshot_at: new Date().toISOString(),
  }, { onConflict: "building_id,snapshot_date" });
}
