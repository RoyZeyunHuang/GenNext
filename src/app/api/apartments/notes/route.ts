import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/apartments/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/apartments/notes  — create a note on a building or a listing.
 * Body: { building_id?: string, listing_id?: string, body: string }
 *
 * DELETE /api/apartments/notes?id=xxx&kind=building|listing
 */

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (r) {
    return r as Response;
  }
  const body = (await req.json()) as {
    building_id?: string;
    listing_id?: string;
    body?: string;
  };
  const text = (body.body ?? "").trim();
  if (!text) return Response.json({ error: "body required" }, { status: 400 });
  if (text.length > 3500)
    return Response.json({ error: "body too long" }, { status: 400 });

  const db = getSupabaseAdmin();
  const common = { author_id: user.id, author_email: user.email, body: text };

  if (body.building_id) {
    const { data, error } = await db
      .from("apt_building_notes")
      .insert({ ...common, building_id: body.building_id })
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ note: data });
  }
  if (body.listing_id) {
    const { data, error } = await db
      .from("apt_listing_notes")
      .insert({ ...common, listing_id: body.listing_id })
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ note: data });
  }
  return Response.json(
    { error: "building_id or listing_id required" },
    { status: 400 }
  );
}

export async function DELETE(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (r) {
    return r as Response;
  }
  const id = req.nextUrl.searchParams.get("id");
  const kind = req.nextUrl.searchParams.get("kind");
  if (!id || (kind !== "building" && kind !== "listing"))
    return Response.json({ error: "id and kind=building|listing required" }, { status: 400 });

  const db = getSupabaseAdmin();
  const table = kind === "building" ? "apt_building_notes" : "apt_listing_notes";
  // Only the author can delete.
  const { error } = await db
    .from(table)
    .delete()
    .eq("id", id)
    .eq("author_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
