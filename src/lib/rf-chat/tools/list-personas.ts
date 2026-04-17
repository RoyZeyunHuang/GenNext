import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ok, toolError, type Tool } from "../types";

export const listPersonasTool: Tool = {
  name: "list_personas",
  description:
    "列出当前用户可用的人格（我的 + 公开）。status=ok，data.personas[]。仅当用户明确要浏览/挑选时调；如果只是想用某个叫某名的人格，直接调 generate_copy 传 name 即可。",
  input_schema: { type: "object" as const, properties: {}, required: [] },
  async execute(_input, ctx) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("personas")
      .select("id, name, bio_md, is_public, user_id")
      .or(`user_id.eq.${ctx.userId},is_public.eq.true`)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return toolError(error.message);
    return ok({
      personas: (data ?? []).map((p) => {
        const r = p as {
          id: string;
          name: string | null;
          bio_md: string | null;
          is_public: boolean;
          user_id: string | null;
        };
        return {
          id: r.id,
          name: r.name ?? "",
          bio_preview: (r.bio_md ?? "").slice(0, 160),
          is_public: r.is_public,
          mine: r.user_id === ctx.userId,
        };
      }),
    });
  },
};
