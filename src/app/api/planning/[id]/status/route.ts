import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["draft", "scheduled", "in_progress", "done"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const status = body.status;
  if (!status || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: "status must be one of: " + ALLOWED.join(", ") }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("content_plans")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
