import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/apartments/units  — flat, filterable unit list (agent query view).
 *
 * Query params:
 *   area=lic|manhattan|brooklyn|queens|jersey_city|all
 *   beds=0,1,2,3
 *   min_price, max_price
 *   no_fee=1
 *   move_in_after=YYYY-MM-DD
 *   sort=newest|price_asc|price_desc|move_in
 *   limit (default 100, max 500)
 *   offset
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const db = getSupabaseAdmin();

  const area = sp.get("area") ?? "all";
  const beds = (sp.get("beds") ?? "")
    .split(",")
    .map((x) => Number(x))
    .filter((n) => !Number.isNaN(n));
  const minPrice = sp.get("min_price");
  const maxPrice = sp.get("max_price");
  const noFee = sp.get("no_fee") === "1";
  const moveInAfter = sp.get("move_in_after");
  const sort = sp.get("sort") ?? "newest";
  const limit = Math.min(Number(sp.get("limit") ?? "100"), 500);
  const offset = Math.max(0, Number(sp.get("offset") ?? "0"));

  // First narrow building ids if we need area filter.
  let buildingIds: string[] | null = null;
  if (area !== "all") {
    const { data: bs } = await db
      .from("apt_buildings")
      .select("id")
      .eq("area", area)
      .eq("is_tracked", true);
    buildingIds = (bs ?? []).map((b: { id: string }) => b.id);
    if (buildingIds.length === 0)
      return Response.json({ units: [], total: 0 });
  }

  let q = db
    .from("apt_listings")
    .select(
      "id, building_id, url, unit, address, neighborhood, borough, " +
        "price_monthly, bedrooms, bathrooms, sqft, no_fee, furnished, " +
        "available_at, months_free, lease_term_months, image_url, floor_plan_url, " +
        "first_seen_at, apt_buildings:building_id(name, tag, area, official_url, image_url)",
      { count: "exact" }
    )
    .eq("is_active", true);

  if (buildingIds) q = q.in("building_id", buildingIds);
  if (beds.length > 0) q = q.in("bedrooms", beds);
  if (minPrice) q = q.gte("price_monthly", Number(minPrice));
  if (maxPrice) q = q.lte("price_monthly", Number(maxPrice));
  if (noFee) q = q.eq("no_fee", true);
  if (moveInAfter) q = q.gte("available_at", moveInAfter);

  switch (sort) {
    case "price_asc":
      q = q.order("price_monthly", { ascending: true, nullsFirst: false });
      break;
    case "price_desc":
      q = q.order("price_monthly", { ascending: false, nullsFirst: false });
      break;
    case "move_in":
      q = q.order("available_at", { ascending: true, nullsFirst: false });
      break;
    default:
      q = q.order("first_seen_at", { ascending: false });
  }
  q = q.range(offset, offset + limit - 1);

  const { data, count, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ units: data ?? [], total: count ?? 0 });
}
