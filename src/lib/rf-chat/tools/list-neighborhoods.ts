import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ok, toolError, type Tool } from "../types";

type Input = { area?: string };

export const listNeighborhoodsTool: Tool<Input> = {
  name: "list_neighborhoods",
  description:
    "列出具体小区名（neighborhood）+ 每个小区楼盘数。可按 area 过滤。status=ok。",
  input_schema: {
    type: "object" as const,
    properties: {
      area: {
        type: "string",
        description: "area 枚举值之一（可选）",
        enum: ["lic", "queens", "manhattan", "brooklyn", "jersey_city"],
      },
    },
    required: [],
  },
  async execute(input) {
    const admin = getSupabaseAdmin();
    let query = admin
      .from("apt_buildings")
      .select("neighborhood, area")
      .eq("is_tracked", true);
    if (input?.area) query = query.eq("area", input.area);
    const { data, error } = await query;
    if (error) return toolError(error.message);
    const counts = new Map<string, { area: string; count: number }>();
    for (const r of data ?? []) {
      const n = (r as { neighborhood: string | null }).neighborhood;
      if (!n) continue;
      const a = (r as { area: string }).area;
      const prev = counts.get(n);
      if (prev) prev.count += 1;
      else counts.set(n, { area: a, count: 1 });
    }
    return ok({
      neighborhoods: Array.from(counts.entries())
        .map(([neighborhood, v]) => ({ neighborhood, area: v.area, count: v.count }))
        .sort((a, b) => b.count - a.count),
    });
  },
};
