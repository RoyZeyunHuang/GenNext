import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || "";
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let list = data ?? [];
  if (search) {
    const lower = search.toLowerCase();
    list = list.filter(
      (a) =>
        (a.name ?? "").toLowerCase().includes(lower) ||
        (a.notes ?? "").toLowerCase().includes(lower)
    );
  }
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, platform = "小红书", color, notes } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      name: name.trim(),
      platform: platform?.trim() || "小红书",
      color: color || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
