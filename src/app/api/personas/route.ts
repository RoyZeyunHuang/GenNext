import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gate = await requirePersonaRagRoute();
    if (!gate.ok) return gate.response;

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("personas")
      .select("id, name, short_description, bio_md, source_url, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e) {
    console.error("[GET /api/personas]", e);
    const message = e instanceof Error ? e.message : "内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requirePersonaRagRoute();
    if (!gate.ok) return gate.response;

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const short_description =
      typeof body.short_description === "string" ? body.short_description.trim() : null;
    const bio_md = typeof body.bio_md === "string" ? body.bio_md : "";
    const source_url =
      typeof body.source_url === "string" && body.source_url.trim()
        ? body.source_url.trim()
        : null;

    if (!name) {
      return NextResponse.json({ error: "name 必填" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("personas")
      .insert({
        user_id: gate.session.userId,
        name,
        short_description,
        bio_md,
        source_url,
      })
      .select("id, name, short_description, bio_md, source_url, created_at, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    console.error("[POST /api/personas]", e);
    const message = e instanceof Error ? e.message : "内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
