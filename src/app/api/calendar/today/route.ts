import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!date) return NextResponse.json([]);

  const { data, error } = await supabase
    .rpc("get_calendar_by_date", { p_date: date });

  console.log("RPC结果:", data, error);
  return NextResponse.json(data || []);
}
