import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/apartments/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only. Toggle `is_tracked` on a building, or update its `note`.
 *
 * POST body: { building_id: string, is_tracked?: boolean, note?: string }
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (r) {
    return r as Response;
  }
  const body = (await req.json()) as {
    building_id?: string;
    is_tracked?: boolean;
    note?: string;
  };
  if (!body.building_id)
    return Response.json({ error: "building_id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.is_tracked === "boolean") patch.is_tracked = body.is_tracked;
  if (typeof body.note === "string") patch.note = body.note;
  if (Object.keys(patch).length === 1)
    return Response.json({ error: "no fields to update" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("apt_buildings")
    .update(patch)
    .eq("id", body.building_id)
    .select("id, is_tracked, note")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ building: data });
}
