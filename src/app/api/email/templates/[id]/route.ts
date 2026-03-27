import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, subject, body: tplBody } = body;
    const { data, error } = await supabase
      .from("email_templates")
      .update({
        ...(name != null && { name }),
        ...(subject != null && { subject }),
        ...(tplBody != null && { body: tplBody }),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      return NextResponse.json(
        { error: error.message || "更新模板失败" },
        { status: 500 }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "请求体无效或更新失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabase.from("email_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
