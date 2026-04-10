import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { personaListOrFilter } from "@/lib/persona-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERSONA_SELECT =
  "id, user_id, name, short_description, bio_md, source_url, is_public, generate_invocation_count, created_at, updated_at";

export async function GET() {
  try {
    const gate = await requirePersonaRagRoute();
    if (!gate.ok) return gate.response;

    let q = supabase.from("personas").select(PERSONA_SELECT).order("updated_at", { ascending: false });
    const orFilter = personaListOrFilter(gate.session);
    if (orFilter) {
      q = q.or(orFilter);
    }

    const { data, error } = await q;

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

    const { data, error } = await supabase
      .from("personas")
      .insert({
        user_id: gate.session.userId,
        name,
        short_description,
        bio_md,
        source_url,
        is_public: false,
      })
      .select(PERSONA_SELECT)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    console.error("[POST /api/personas]", e);
    const message = e instanceof Error ? e.message : "内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
