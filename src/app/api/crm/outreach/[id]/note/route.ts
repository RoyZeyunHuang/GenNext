import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { note } = (await req.json()) as { note: string };
  const { data: current } = await supabase
    .from("outreach")
    .select("notes")
    .eq("id", params.id)
    .single();
  const timestamp = new Date().toLocaleString("zh-CN", { timeZone: "America/New_York" });
  const entry = `[${timestamp}] ${note}`;
  const existing = current?.notes ?? "";
  const updated = existing ? `${entry}\n---\n${existing}` : entry;
  const { data, error } = await supabase
    .from("outreach")
    .update({ notes: updated, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("*, properties(id, name, address)")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
