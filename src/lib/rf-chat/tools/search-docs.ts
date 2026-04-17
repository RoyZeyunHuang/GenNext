import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { invalidInput, ok, toolError, type Tool } from "../types";

type Input = { query?: string };

export const searchDocsTool: Tool<Input> = {
  name: "search_docs",
  description:
    "按关键词搜档案库（品牌档案 / 任务模板 / 知识库），title + content ILIKE。status=ok（data.docs[]，可能为空）。",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
  },
  async execute(input) {
    const q = (input.query ?? "").trim();
    if (!q) return invalidInput("query 必填");
    const esc = q.replace(/[%,]/g, "");
    const admin = getSupabaseAdmin();
    const { data: docs, error } = await admin
      .from("docs")
      .select("id, title, content, category_id, tags")
      .or(`title.ilike.%${esc}%,content.ilike.%${esc}%`)
      .limit(10);
    if (error) return toolError(error.message);

    const catIds = Array.from(
      new Set((docs ?? []).map((d) => (d as { category_id: string }).category_id))
    );
    const { data: cats } = await admin
      .from("doc_categories")
      .select("id, name")
      .in("id", catIds);
    const catMap = new Map(
      (cats ?? []).map((c) => [(c as { id: string }).id, (c as { name: string }).name])
    );

    return ok({
      docs: (docs ?? []).map((d) => ({
        id: (d as { id: string }).id,
        title: (d as { title: string }).title,
        content_preview: ((d as { content: string | null }).content ?? "").slice(0, 400),
        category: catMap.get((d as { category_id: string }).category_id) ?? "",
        tags: (d as { tags: unknown }).tags,
      })),
    });
  },
};
