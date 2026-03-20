import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const idsRaw = req.nextUrl.searchParams.get("company_ids") ?? "";
    const companyIds = idsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!companyIds.length) {
      return NextResponse.json([]);
    }

    const { data, error } = await supabase
      .from("contacts")
      .select("id, company_id, name, title, phone, email, linkedin_url, is_primary")
      .in("company_id", companyIds);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

