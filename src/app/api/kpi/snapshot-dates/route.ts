import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toDateString(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v.slice(0, 10);
  if (typeof v === "object" && typeof (v as Date).toISOString === "function") {
    return (v as Date).toISOString().slice(0, 10);
  }
  return null;
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  console.log("[snapshot-dates] 收到请求, SUPABASE_URL:", supabaseUrl ? `${supabaseUrl.slice(0, 30)}...` : "(未配置)");
  const { data, error } = await supabase
    .from("xhs_notes")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false });
  if (error) {
    console.log("[snapshot-dates] 查询错误:", error.message, "code:", error.code);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const dates = [...new Set((data ?? []).map((r) => toDateString(r.snapshot_date)).filter(Boolean))] as string[];
  console.log("[snapshot-dates] 查询结果条数:", data?.length ?? 0, "去重后日期数:", dates.length);
  if ((data?.length ?? 0) === 0) {
    console.warn("[snapshot-dates] 当前连接返回 0 条，请确认 .env.local 的 NEXT_PUBLIC_SUPABASE_URL 与 Supabase 控制台「项目 URL」一致，且表 xhs_notes 存在并允许 anon 读取（RLS 策略）");
  }
  return NextResponse.json(dates, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
