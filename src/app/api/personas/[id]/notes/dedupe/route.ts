import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { personaNoteContentKey } from "@/lib/persona-rag/retrieve-threshold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensurePersonaOwned(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  personaId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase.from("personas").select("id").eq("id", personaId).eq("user_id", userId).maybeSingle();
  return !!data;
}

/**
 * 按「规范化标题+正文」合并重复：每组保留最早创建的一条，删除其余。
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePersonaRagRoute();
  if (!gate.ok) return gate.response;

  const { id: personaId } = await params;
  const supabase = createSupabaseServerClient();
  if (!(await ensurePersonaOwned(supabase, personaId, gate.session.userId))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
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
