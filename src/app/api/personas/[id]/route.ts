import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requirePersonaRagRoute();
    if (!gate.ok) return gate.response;

    const { id } = await params;
    const supabase = createSupabaseServerClient();

    const { data: persona, error: pe } = await supabase
      .from("personas")
      .select("id, name, short_description, bio_md, source_url, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();

    if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });
    if (!persona) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { count, error: ce } = await supabase
      .from("persona_notes")
      .select("id", { count: "exact", head: true })
      .eq("persona_id", id);

    if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });

    return NextResponse.json({ ...persona, notes_count: count ?? 0 });
  } catch (e) {
    console.error("[GET /api/personas/[id]]", e);
    const message = e instanceof Error ? e.message : "内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requirePersonaRagRoute();
    if (!gate.ok) return gate.response;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const patchDb: Record<string, string | null> & { updated_at?: string } = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.name === "string") patchDb.name = body.name.trim();
    if (typeof body.short_description === "string")
      patchDb.short_description = body.short_description.trim() || null;
    if (typeof body.bio_md === "string") patchDb.bio_md = body.bio_md;

    if (Object.keys(patchDb).length <= 1) {
      return NextResponse.json({ error: "无有效字段" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("personas")
      .update(patchDb)
      .eq("id", id)
      .select("id, name, short_description, bio_md, source_url, created_at, updated_at")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    console.error("[PATCH /api/personas/[id]]", e);
    const message = e instanceof Error ? e.message : "内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requirePersonaRagRoute();
    if (!gate.ok) return gate.response;

    const { id } = await params;
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("personas").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/personas/[id]]", e);
    const message = e instanceof Error ? e.message : "内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
