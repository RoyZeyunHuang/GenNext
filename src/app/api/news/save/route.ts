import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { source_url, summary_zh, tags } = body as {
      source_url?: string;
      summary_zh?: string;
      tags?: string[];
    };

    const { data, error } = await supabase.from("news_items").insert({
      source_url: source_url ?? null,
      summary_zh: summary_zh ?? null,
      tags: tags ?? [],
      created_at: new Date().toISOString(),
    }).select().single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
