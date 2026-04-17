import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ok, toolError, type Tool } from "../types";

const AREA_ZH: Record<string, string> = {
  lic: "LIC（Long Island City）",
  queens: "Queens（不含 LIC）",
  manhattan: "Manhattan",
  brooklyn: "Brooklyn",
  jersey_city: "Jersey City",
};

export const listAreasTool: Tool = {
  name: "list_areas",
  description:
    "列出数据库里所有大区（area）+ 每个区被追踪的楼盘数。status=ok。用户说的地名对应不上 area 时先用它。",
  input_schema: { type: "object" as const, properties: {}, required: [] },
  async execute() {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("apt_buildings")
      .select("area")
      .eq("is_tracked", true);
    if (error) return toolError(error.message);
    const counts = new Map<string, number>();
    for (const r of data ?? []) {
      const a = (r as { area: string }).area;
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    return ok({
      areas: Array.from(counts.entries())
        .map(([area, count]) => ({ area, label_zh: AREA_ZH[area] ?? area, count }))
        .sort((a, b) => b.count - a.count),
    });
  },
};
