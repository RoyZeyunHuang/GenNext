import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data: plan, error: planErr } = await supabase
    .from("content_plans")
    .select("*")
    .eq("id", id)
    .single();
  if (planErr || !plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: accounts } = await supabase
    .from("plan_accounts")
    .select("*")
    .eq("plan_id", id)
    .order("sort_order", { ascending: true });

  const { data: items } = await supabase
    .from("content_items")
    .select("*")
    .eq("plan_id", id)
    .order("publish_date", { ascending: true })
    .order("sort_order", { ascending: true });

  return NextResponse.json({
    ...plan,
    accounts: accounts ?? [],
    items: items ?? [],
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { title, date_from, date_to, theme, hooks, strategy_notes, status } = body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = String(title).trim();
  if (date_from !== undefined) updates.date_from = date_from;
  if (date_to !== undefined) updates.date_to = date_to;
  if (theme !== undefined) updates.theme = theme?.trim() || null;
  if (hooks !== undefined) updates.hooks = Array.isArray(hooks) ? hooks : [];
  if (strategy_notes !== undefined) updates.strategy_notes = strategy_notes?.trim() || null;
  if (status !== undefined) updates.status = status;

  const { data, error } = await supabase
    .from("content_plans")
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
  const { error } = await supabase.from("content_plans").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
