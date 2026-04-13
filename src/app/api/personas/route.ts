import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { personaListOrFilter } from "@/lib/persona-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERSONA_SELECT =
  "id, user_id, name, short_description, bio_md, source_url, is_public, visibility, generate_invocation_count, created_at, updated_at";

/** Extra columns that may not exist if migrations haven't been applied yet. */
const PERSONA_SELECT_EXTENDED =
  "id, user_id, name, short_description, self_intro, bio_md, source_url, is_public, visibility, source_persona_id, generate_invocation_count, created_at, updated_at";

/** Fallback selects without visibility column (pre-migration) */
const PERSONA_SELECT_LEGACY =
  "id, user_id, name, short_description, bio_md, source_url, is_public, generate_invocation_count, created_at, updated_at";
const PERSONA_SELECT_LEGACY_EXT =
  "id, user_id, name, short_description, self_intro, bio_md, source_url, is_public, source_persona_id, generate_invocation_count, created_at, updated_at";

export async function GET() {
  try {
    const gate = await requirePersonaRagRoute();
    if (!gate.ok) return gate.response;

    const orFilter = personaListOrFilter(gate.session);

    // Try selects in order: extended+visibility → basic+visibility → legacy extended → legacy basic
    for (const sel of [
      PERSONA_SELECT_EXTENDED,
      PERSONA_SELECT,
      PERSONA_SELECT_LEGACY_EXT,
      PERSONA_SELECT_LEGACY,
    ]) {
      let q = supabase.from("personas").select(sel).order("updated_at", { ascending: false });
      if (orFilter) q = q.or(orFilter);
      const { data, error } = await q;
      if (error) continue; // retry with simpler select

      // For "assigned" visibility personas, we need to also include ones where the user is in allowed_users
      // but Supabase .or() can't do a join-based check. So we do a second query.
      if (!gate.session.isAdmin && !gate.session.hasMainAccess) {
        // Check if there are any assigned personas for this user
        const { data: assignedRows } = await supabase
          .from("persona_allowed_users")
          .select("persona_id")
          .eq("user_id", gate.session.userId);

        if (assignedRows && assignedRows.length > 0) {
          const assignedIds = assignedRows.map((r) => r.persona_id as string);
          const alreadyIds = new Set(
            (data ?? []).map((p) => String((p as unknown as Record<string, unknown>).id))
          );
          const missingIds = assignedIds.filter((id) => !alreadyIds.has(id));

          if (missingIds.length > 0) {
            const { data: assignedPersonas } = await supabase
              .from("personas")
              .select(sel)
              .in("id", missingIds)
              .eq("visibility", "assigned")
              .order("updated_at", { ascending: false });

            if (assignedPersonas) {
              return NextResponse.json([...(data ?? []), ...assignedPersonas]);
            }
          }
        }
      }

      return NextResponse.json(data ?? []);
    }

    return NextResponse.json([]);
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
        visibility: "private",
      })
      .select(PERSONA_SELECT_LEGACY)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    console.error("[POST /api/personas]", e);
    const message = e instanceof Error ? e.message : "内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
