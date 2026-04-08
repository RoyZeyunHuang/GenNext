import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const gate = await requirePersonaRagRoute();
  if (!gate.ok) return gate.response;

  const { id: personaId, noteId } = await params;
  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from("persona_notes")
    .delete()
    .eq("id", noteId)
    .eq("persona_id", personaId)
    .eq("user_id", gate.session.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
