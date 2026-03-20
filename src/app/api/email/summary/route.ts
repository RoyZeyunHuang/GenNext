import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { company_ids } = (await req.json()) as { company_ids: string[] };
    if (!Array.isArray(company_ids) || !company_ids.length) {
      return NextResponse.json({});
    }

    const { data, error } = await supabase
      .from("emails")
      .select("company_id, ai_summary, created_at, direction")
      .in("company_id", company_ids)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const map: Record<
      string,
      { latest_received_ai_summary: string | null; created_at: string }
    > = {};
    for (const row of data ?? []) {
      const cid = row.company_id as string;
      if (!cid || map[cid]) continue;
      const direction = row.direction as string | null;
      if (direction !== "received") continue;
      map[cid] = {
        latest_received_ai_summary: (row as { ai_summary?: string | null }).ai_summary ?? null,
        created_at: row.created_at as string,
      };
    }

    return NextResponse.json(map);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
