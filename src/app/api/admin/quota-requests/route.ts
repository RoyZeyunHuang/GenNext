import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireRfAdmin } from "@/lib/require-rf-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireRfAdmin();
  if (!gate.ok) return gate.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("quota_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
