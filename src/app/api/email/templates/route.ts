import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, subject, body: tplBody } = body;
    if (!name?.trim() || !subject?.trim() || !tplBody?.trim()) {
      return NextResponse.json({ error: "name, subject, body 必填" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("email_templates")
      .insert({ name: name.trim(), subject: subject.trim(), body: tplBody })
      .select()
      .single();
    if (error) {
      return NextResponse.json(
        { error: error.message || "保存模板失败" },
        { status: 500 }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : "请求体无效或保存失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
