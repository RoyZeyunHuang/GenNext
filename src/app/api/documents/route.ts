import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url?.trim() || !key?.trim()) {
    return new Response(
      JSON.stringify({
        error:
          "未配置 Supabase，请在 .env.local 中设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GET /api/documents] Supabase error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const list = Array.isArray(data) ? data : [];
  console.log("[GET /api/documents] 返回记录数:", list.length, list.length > 0 ? "首条 id:" + list[0]?.id : "");

  return new Response(JSON.stringify(list), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
