import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/apartments/buildings?area=lic  — list of tracked buildings. */
export async function GET(req: NextRequest) {
  const area = req.nextUrl.searchParams.get("area") ?? "all";
  const db = getSupabaseAdmin();

  let q = db
    .from("apt_buildings")
    .select(
      "id, name, address, neighborhood, borough, area, tag, building_url, building_slug, " +
        "official_url, leasing_company, year_built, floor_count, unit_count, " +
        "active_rentals_count, open_rentals_count, closed_rentals_count, " +
        "is_new_development, image_url, note, last_fetched_at"
    )
    .eq("is_tracked", true)
    .order("tag", { ascending: true })
    .order("active_rentals_count", { ascending: false, nullsFirst: false });
  if (area && area !== "all") q = q.eq("area", area);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ buildings: data ?? [] });
}
