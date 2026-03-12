import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = (body.name as string)?.trim();
    const type = (body.type as string)?.trim() || "产品资料";
    const content = typeof body.content === "string" ? body.content : "";

    if (!name) {
      return new Response(JSON.stringify({ error: "缺少文件名" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: row, error } = await supabase
      .from("documents")
      .insert({
        name,
        type,
        content: content || null,
        file_url: name,
      })
      .select("id")
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: "保存失败: " + error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ id: row.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "保存失败" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
