import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/apartments/units/[id]  — single unit + building + notes. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = decodeURIComponent(params.id);
  const db = getSupabaseAdmin();

  const { data: unit, error: uErr } = await db
    .from("apt_listings")
    .select("*")
    .eq("id", id)
    .single();
  if (uErr) return Response.json({ error: uErr.message }, { status: 404 });

  const [{ data: building }, { data: notes }] = await Promise.all([
    unit.building_id
      ? db.from("apt_buildings").select("*").eq("id", unit.building_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("apt_listing_notes")
      .select("*")
      .eq("listing_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return Response.json({
    unit,
    building: building ?? null,
    notes: notes ?? [],
  });
}
