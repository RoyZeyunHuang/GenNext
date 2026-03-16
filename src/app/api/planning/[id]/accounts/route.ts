import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await supabase
    .from("plan_accounts")
    .select("*")
    .eq("plan_id", id)
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: plan_id } = await params;
  const body = await req.json();
  const { account_name, hook_index, persona_doc_id, persona_name, color, positioning, sort_order } = body;
  if (!account_name?.trim()) return NextResponse.json({ error: "account_name required" }, { status: 400 });
  const { data, error } = await supabase
    .from("plan_accounts")
    .insert({
      plan_id,
      account_name: account_name.trim(),
      hook_index: hook_index != null ? Number(hook_index) : null,
      persona_doc_id: persona_doc_id || null,
      persona_name: persona_name?.trim() || null,
      color: color || null,
      positioning: positioning?.trim() || null,
      sort_order: Number(sort_order) ?? 0,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
