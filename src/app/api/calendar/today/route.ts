import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  const endDate = req.nextUrl.searchParams.get("end_date") ?? "";
  if (!date) return NextResponse.json([]);

  if (endDate) {
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("date", date)
      .lte("date", endDate)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  const { data, error } = await supabase.rpc("get_calendar_by_date", { p_date: date });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
