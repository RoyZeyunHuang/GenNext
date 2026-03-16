import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 用于排查「数据库有数据但 KPI 显示为空」：在浏览器打开 /api/kpi/debug-db 查看当前连接与行数 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const hasKey = !!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

  const { count, error } = await supabase
    .from("xhs_notes")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    message: "请对比下方 supabase_project_url 与 Supabase 控制台 Project Settings → API 中的 Project URL 是否一致",
    supabase_project_url: url || "(未配置 NEXT_PUBLIC_SUPABASE_URL)",
    anon_key_configured: hasKey,
    xhs_notes_row_count: error ? null : count ?? null,
    error: error ? error.message : null,
  });
}
