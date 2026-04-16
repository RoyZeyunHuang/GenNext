import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/apartments/buildings/[slug]  — one building + its active units + notes. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = decodeURIComponent(params.slug);
  const db = getSupabaseAdmin();

  // Chain lookups to avoid .or() with URL special chars
  let building = null;
  const { data: b1 } = await db.from("apt_buildings").select("*").eq("building_slug", slug).maybeSingle();
  building = b1;
  if (!building) {
    const { data: b2 } = await db.from("apt_buildings").select("*").eq("id", slug).maybeSingle();
    building = b2;
  }
  if (!building) {
    const fullUrl = `https://streeteasy.com/building/${slug}`;
    const { data: b3 } = await db.from("apt_buildings").select("*").eq("id", fullUrl).maybeSingle();
    building = b3;
    if (!building) {
      const { data: b4 } = await db.from("apt_buildings").select("*").eq("building_url", fullUrl).maybeSingle();
      building = b4;
    }
  }
  if (!building) return Response.json({ error: "building not found" }, { status: 404 });

  const [{ data: listings }, { data: notes }] = await Promise.all([
    db
      .from("apt_listings")
      .select("*")
      .eq("building_id", building.id)
      .eq("is_active", true)
      .order("bedrooms", { ascending: true, nullsFirst: true })
      .order("price_monthly", { ascending: true, nullsFirst: false }),
    db
      .from("apt_building_notes")
      .select("*")
      .eq("building_id", building.id)
      .order("created_at", { ascending: false }),
  ]);

  return Response.json({
    building,
    listings: listings ?? [],
    notes: notes ?? [],
  });
}
