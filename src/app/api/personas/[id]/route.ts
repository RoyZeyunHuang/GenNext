import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import {
  canReadPersona,
  canSetPersonaVisibility,
  canWritePersona,
  type PersonaVisibility,
} from "@/lib/persona-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERSONA_SELECT =
  "id, user_id, name, short_description, bio_md, source_url, is_public, visibility, generate_invocation_count, created_at, updated_at";

const VALID_VISIBILITY = new Set<PersonaVisibility>(["private", "main_site", "public", "assigned"]);

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

    // For "assigned" visibility, load allowed users to check access
    let allowedUserIds: string[] | undefined;
    if (persona.visibility === "assigned") {
      const { data: rows } = await supabase
        .from("persona_allowed_users")
        .select("user_id")
        .eq("persona_id", id);
      allowedUserIds = rows?.map((r) => r.user_id as string) ?? [];
    }

    if (!canReadPersona(gate.session, { ...persona, allowed_user_ids: allowedUserIds })) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { count, error: ce } = await supabase
      .from("persona_notes")
      .select("id", { count: "exact", head: true })
      .eq("persona_id", id);

    if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });

    return NextResponse.json({
      ...persona,
      notes_count: count ?? 0,
      allowed_user_ids: allowedUserIds ?? [],
    });
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

    // Legacy is_public support — map to visibility
    if (typeof body.is_public === "boolean") {
      if (!canSetPersonaVisibility(gate.session)) {
        return NextResponse.json({ error: "forbidden: only admin can change visibility" }, { status: 403 });
      }
      patchDb.is_public = body.is_public;
      patchDb.visibility = body.is_public ? "public" : "private";
    }

    // New visibility field
    if (typeof body.visibility === "string") {
      if (!canSetPersonaVisibility(gate.session)) {
        return NextResponse.json({ error: "forbidden: only admin can change visibility" }, { status: 403 });
      }
      if (!VALID_VISIBILITY.has(body.visibility as PersonaVisibility)) {
        return NextResponse.json({ error: "visibility 必须为 private/main_site/public/assigned" }, { status: 400 });
      }
      patchDb.visibility = body.visibility;
      // Keep is_public in sync
      patchDb.is_public = body.visibility === "public";
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

    // Update allowed_user_ids if provided (only for assigned visibility)
    if (Array.isArray(body.allowed_user_ids) && canSetPersonaVisibility(gate.session)) {
      const newIds: string[] = body.allowed_user_ids.filter(
        (x: unknown) => typeof x === "string" && x.trim()
      );

      // Delete existing, re-insert
      await supabase.from("persona_allowed_users").delete().eq("persona_id", id);

      if (newIds.length > 0) {
        await supabase.from("persona_allowed_users").insert(
          newIds.map((uid) => ({ persona_id: id, user_id: uid }))
        );
      }
    }

    // Load final allowed users
    const { data: allowedRows } = await supabase
      .from("persona_allowed_users")
      .select("user_id")
      .eq("persona_id", id);

    return NextResponse.json({
      ...data,
      allowed_user_ids: allowedRows?.map((r) => r.user_id) ?? [],
    });
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
      .select("id, user_id, is_public, visibility")
      .eq("id", id)
      .maybeSingle();

    if (fe) return NextResponse.json({ error: fe.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (!canWritePersona(gate.session, existing)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // persona_allowed_users cascade-deletes automatically
    const { error } = await supabase.from("personas").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/personas/[id]]", e);
    const message = e instanceof Error ? e.message : "内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
