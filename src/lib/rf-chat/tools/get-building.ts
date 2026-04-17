import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ambiguous, invalidInput, notFound, ok, type Tool } from "../types";
import { resolveBuilding } from "../resolvers";

type Input = { building?: string };

export const getBuildingTool: Tool<Input> = {
  name: "get_building",
  description:
    "拉单栋楼完整详情 + 活跃 listing 列表。`building` 接受 name / short_name / slug / id 任何一种——直接传用户说的名字即可。status=ok/ambiguous/not_found。",
  input_schema: {
    type: "object" as const,
    properties: {
      building: {
        type: "string",
        description: "楼盘名或 slug 或 id（比如「SOLA」「sola」「sola-woodside」）",
      },
    },
    required: ["building"],
  },
  async execute(input) {
    const key = (input.building ?? "").trim();
    if (!key) return invalidInput("缺少 building 参数");

    const resolution = await resolveBuilding(key);
    if (resolution.kind === "not_found") return notFound(key);
    if (resolution.kind === "ambiguous") {
      return ambiguous(
        resolution.candidates,
        `找到 ${resolution.candidates.length} 栋叫「${key}」的楼，用 ask_user 让用户选一个（用 label），选定后把他选的 label 再传回 get_building 或下一步。`
      );
    }
    const b = resolution.building;
    const admin = getSupabaseAdmin();
    const { data: listings } = await admin
      .from("apt_listings")
      .select(
        "id, url, unit, price_monthly, bedrooms, bathrooms, sqft, no_fee, furnished, available_at, months_free, lease_term_months, image_url, first_seen_at, listing_type"
      )
      .eq("building_id", b.id)
      .eq("is_active", true)
      .order("bedrooms", { ascending: true, nullsFirst: false })
      .order("price_monthly", { ascending: true, nullsFirst: false })
      .limit(30);

    return ok({
      building: b,
      active_listings: listings ?? [],
      listing_count: (listings ?? []).length,
    });
  },
};
