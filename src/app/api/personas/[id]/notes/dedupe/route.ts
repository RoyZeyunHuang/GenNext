import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { canWritePersona } from "@/lib/persona-access";
import { personaNoteContentKey } from "@/lib/persona-rag/retrieve-threshold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePersonaRagRoute();
  if (!gate.ok) return gate.response;

  const { id: personaId } = await params;

  const { data: persona } = await supabase
    .from("personas")
    .select("user_id, is_public")
    .eq("id", personaId)
    .maybeSingle();
  if (!persona) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canWritePersona(gate.session, persona)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: notes, error: le } = await supabase
    .from("persona_notes")
    .select("id, title, body, created_at")
    .eq("persona_id", personaId)
    .order("created_at", { ascending: true });

  if (le) return NextResponse.json({ error: le.message }, { status: 500 });
  if (!notes?.length) return NextResponse.json({ deleted: 0 });

  const groups = new Map<string, typeof notes>();
  for (const n of notes) {
    const key = personaNoteContentKey(n.title ?? "", n.body ?? "");
    const list = groups.get(key);
    if (list) list.push(n);
    else groups.set(key, [n]);
  }

  const idsToDelete: string[] = [];
  for (const list of Array.from(groups.values())) {
    if (list.length <= 1) continue;
    const [, ...rest] = list;
    for (const r of rest) idsToDelete.push(r.id);
  }

  if (idsToDelete.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  const { error: de } = await supabase.from("persona_notes").delete().in("id", idsToDelete);
  if (de) return NextResponse.json({ error: de.message }, { status: 500 });

  return NextResponse.json({ deleted: idsToDelete.length });
}
