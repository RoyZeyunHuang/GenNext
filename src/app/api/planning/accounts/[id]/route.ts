import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { account_name, hook_index, persona_doc_id, persona_name, color, positioning, sort_order } = body;
  const updates: Record<string, unknown> = {};
  if (account_name !== undefined) updates.account_name = String(account_name).trim();
  if (hook_index !== undefined) updates.hook_index = hook_index == null ? null : Number(hook_index);
  if (persona_doc_id !== undefined) updates.persona_doc_id = persona_doc_id || null;
  if (persona_name !== undefined) updates.persona_name = persona_name?.trim() || null;
  if (color !== undefined) updates.color = color || null;
  if (positioning !== undefined) updates.positioning = positioning?.trim() || null;
  if (sort_order !== undefined) updates.sort_order = Number(sort_order) ?? 0;

  const { data, error } = await supabase
    .from("plan_accounts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabase.from("plan_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
