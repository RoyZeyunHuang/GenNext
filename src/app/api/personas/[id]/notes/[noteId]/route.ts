import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { canWritePersona } from "@/lib/persona-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const gate = await requirePersonaRagRoute();
  if (!gate.ok) return gate.response;

  const { id: personaId, noteId } = await params;

  const { data: persona } = await supabase
    .from("personas")
    .select("user_id, is_public")
    .eq("id", personaId)
    .maybeSingle();
  if (!persona) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canWritePersona(gate.session, persona)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("persona_notes")
    .delete()
    .eq("id", noteId)
    .eq("persona_id", personaId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
