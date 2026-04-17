import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ok, toolError, type Tool } from "../types";

type Input = { min_count?: number };

export const listAmenitiesTool: Tool<Input> = {
  name: "list_amenities",
  description:
    "列出 amenities 出现过的精确字面量（top 60，按频次降序）。status=ok。传「带泳池」前先调此工具查 Pool / Swimming Pool 实际字面量。",
  input_schema: {
    type: "object" as const,
    properties: {
      min_count: { type: "number", description: "最少出现次数，默认 2" },
    },
    required: [],
  },
  async execute(input) {
    const admin = getSupabaseAdmin();
    const minCount =
      typeof input?.min_count === "number" && input.min_count > 0 ? input.min_count : 2;
    const { data, error } = await admin
      .from("apt_buildings")
      .select("amenities")
      .eq("is_tracked", true);
    if (error) return toolError(error.message);
    const counts = new Map<string, number>();
    for (const r of data ?? []) {
      const arr = (r as { amenities: string[] | null }).amenities ?? [];
      for (const a of arr) {
        const t = (a ?? "").trim();
        if (!t) continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return ok({
      amenities: Array.from(counts.entries())
        .filter(([, c]) => c >= minCount)
        .map(([amenity, count]) => ({ amenity, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 60),
    });
  },
};
