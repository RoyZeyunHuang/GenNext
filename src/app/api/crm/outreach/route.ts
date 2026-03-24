import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const propertyId = req.nextUrl.searchParams.get("property_id");
  let q = supabase
    .from("outreach")
    .select("*, properties(id, name, address, property_companies(role, company_id, companies(id, name)))")
    .order("updated_at", { ascending: false });
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const rows = data ?? [];
  const propertyIds = Array.from(
    new Set(
      rows
        .map((o: { property_id?: string }) => o.property_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const latestByProperty = new Map<string, string>();
  if (propertyIds.length > 0) {
    const { data: emailRows } = await supabase
      .from("emails")
      .select("property_id, status, created_at")
      .in("property_id", propertyIds)
      .eq("direction", "sent");

    const best = new Map<string, { t: number; status: string }>();
    for (const er of emailRows ?? []) {
      const pid = (er as { property_id?: string }).property_id;
      if (!pid) continue;
      const t = new Date((er as { created_at: string }).created_at).getTime();
      const status = (er as { status?: string }).status ?? "sent";
      const prev = best.get(pid);
      if (!prev || t > prev.t) best.set(pid, { t, status });
    }
    for (const [pid, v] of Array.from(best.entries())) latestByProperty.set(pid, v.status);
  }

  const enriched = rows.map((o: Record<string, unknown>) => ({
    ...o,
    latest_sent_email_status: o.property_id
      ? latestByProperty.get(o.property_id as string) ?? null
      : null,
  }));

  return Response.json(enriched);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const payload = {
    ...body,
    stage: body.stage ?? "Not Started",
    deal_status: body.deal_status ?? "Active",
  };
  const { data, error } = await supabase.from("outreach").insert(payload).select("*, properties(id, name, address)").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req: NextRequest) {
  const propertyId = req.nextUrl.searchParams.get("property_id");
  if (!propertyId) return Response.json({ error: "missing property_id" }, { status: 400 });

  const { error } = await supabase.from("outreach").delete().eq("property_id", propertyId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
