import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function queryContacts(companyIds: string[]) {
  if (!companyIds.length) return { data: [] as unknown[], error: null as { message: string } | null };
  const { data, error } = await supabase
    .from("contacts")
    .select("id, company_id, name, title, phone, email, linkedin_url, is_primary")
    .in("company_id", companyIds);
  return { data: data ?? [], error };
}

/**
 * GET 版：company_ids 走 query string。URL 长度受 HTTP header 总大小限制（~8KB）。
 * 当 companyIds 数量超过约 200 个，浏览器发请求会被 Node HTTP parser 拒为
 * 431 Request Header Fields Too Large。现存调用方仍可用，但推荐切 POST。
 */
export async function GET(req: NextRequest) {
  try {
    const idsRaw = req.nextUrl.searchParams.get("company_ids") ?? "";
    const companyIds = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const { data, error } = await queryContacts(companyIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

/**
 * POST 版（推荐）：company_ids 放 JSON body，不受 URL 长度限制。
 * body: { company_ids: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const raw = Array.isArray((body as { company_ids?: unknown }).company_ids)
      ? ((body as { company_ids: unknown[] }).company_ids)
      : [];
    const companyIds = raw
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s): s is string => !!s);
    const { data, error } = await queryContacts(companyIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
