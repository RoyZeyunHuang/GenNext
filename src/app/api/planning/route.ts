import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search")?.trim() || "";
  const theme = searchParams.get("theme"); // "any" | "has" | "none"
  const date_from = searchParams.get("date_from");
  const date_to = searchParams.get("date_to");

  let q = supabase
    .from("content_plans")
    .select("*")
    .order("updated_at", { ascending: false });

  if (status) q = q.eq("status", status);
  if (date_from) q = q.gte("date_to", date_from);
  if (date_to) q = q.lte("date_from", date_to);

  const { data: plans, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let list = plans ?? [];
  if (search) {
    const lower = search.toLowerCase();
    list = list.filter(
      (p) =>
        (p.title ?? "").toLowerCase().includes(lower) ||
        (p.theme ?? "").toLowerCase().includes(lower)
    );
  }
  if (theme === "has") list = list.filter((p) => p.theme?.trim());
  if (theme === "none") list = list.filter((p) => !p.theme?.trim());

  const with_counts = searchParams.get("with_counts") === "true";
  if (with_counts && list.length > 0) {
    const planIds = list.map((p) => p.id);
    const [itemsRes, accountsRes] = await Promise.all([
      supabase.from("content_items").select("plan_id, status").in("plan_id", planIds),
      supabase.from("plan_accounts").select("plan_id, color").in("plan_id", planIds),
    ]);
    const countByPlan: Record<string, { total: number; done: number }> = {};
    for (const p of list) countByPlan[p.id] = { total: 0, done: 0 };
    for (const it of itemsRes.data ?? []) {
      countByPlan[it.plan_id].total += 1;
      if (it.status === "published") countByPlan[it.plan_id].done += 1;
    }
    const accountsByPlan: Record<string, { color: string }[]> = {};
    for (const a of accountsRes.data ?? []) {
      if (!accountsByPlan[a.plan_id]) accountsByPlan[a.plan_id] = [];
      accountsByPlan[a.plan_id].push({ color: a.color ?? "#999" });
    }
    return NextResponse.json(list.map((p) => ({
      ...p,
      item_count: countByPlan[p.id]?.total ?? 0,
      item_done: countByPlan[p.id]?.done ?? 0,
      accounts: accountsByPlan[p.id] ?? [],
    })));
  }

  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, date_from, date_to, theme, hooks, strategy_notes, status } = body;
  if (!title?.trim() || !date_from || !date_to) {
    return NextResponse.json(
      { error: "title, date_from, date_to required" },
      { status: 400 }
    );
  }
  const { data, error } = await supabase
    .from("content_plans")
    .insert({
      title: title.trim(),
      date_from,
      date_to,
      theme: theme?.trim() || null,
      hooks: Array.isArray(hooks) ? hooks : [],
      strategy_notes: strategy_notes?.trim() || null,
      status: status || "draft",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
