import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { canReadPersona, canSetPersonaPublic, canWritePersona } from "@/lib/persona-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERSONA_SELECT =
  "id, user_id, name, short_description, bio_md, source_url, is_public, created_at, updated_at";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requirePersonaRagRoute();
    if (!gate.ok) return gate.response;

    const { id } = await params;

    const { data: persona, error: pe } = await supabase
      .from("personas")
      .select(PERSONA_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });
    if (!persona) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (!canReadPersona(gate.session, persona)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

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

    const { data: existing, error: fe } = await supabase
      .from("personas")
      .select(PERSONA_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (fe) return NextResponse.json({ error: fe.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (!canWritePersona(gate.session, existing)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const patchDb: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.name === "string") patchDb.name = body.name.trim();
    if (typeof body.short_description === "string")
      patchDb.short_description = body.short_description.trim() || null;
    if (typeof body.bio_md === "string") patchDb.bio_md = body.bio_md;

    if (typeof body.is_public === "boolean") {
      if (!canSetPersonaPublic(gate.session)) {
        return NextResponse.json({ error: "forbidden: only super admin can set is_public" }, { status: 403 });
      }
      patchDb.is_public = body.is_public;
    }

    if (Object.keys(patchDb).length <= 1) {
      return NextResponse.json({ error: "无有效字段" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("personas")
      .update(patchDb)
      .eq("id", id)
      .select(PERSONA_SELECT)
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

    const { data: existing, error: fe } = await supabase
      .from("personas")
      .select("id, user_id, is_public")
      .eq("id", id)
      .maybeSingle();

    if (fe) return NextResponse.json({ error: fe.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (!canWritePersona(gate.session, existing)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { error } = await supabase.from("personas").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/personas/[id]]", e);
    const message = e instanceof Error ? e.message : "内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
