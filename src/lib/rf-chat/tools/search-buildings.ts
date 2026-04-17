import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ok, toolError, type Tool } from "../types";

type Input = {
  query?: string;
  area?: string;
  neighborhood?: string;
  min_bed?: number;
  max_bed?: number;
  min_price?: number;
  max_price?: number;
  amenities?: string[];
  limit?: number;
};

export const searchBuildingsTool: Tool<Input> = {
  name: "search_buildings",
  description:
    "综合搜楼盘。query 走分词 ILIKE（name / short_name / neighborhood / address），area/bed/price/amenities 走精确过滤。全部可选。status=ok；列表为空时 data.buildings=[]，不是 not_found。",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "自由文本，支持多词。比如「Sola Woodside」「Halletts」" },
      area: {
        type: "string",
        enum: ["lic", "queens", "manhattan", "brooklyn", "jersey_city"],
      },
      neighborhood: { type: "string", description: "精确或 ilike 匹配" },
      min_bed: { type: "number", description: "0=Studio" },
      max_bed: { type: "number" },
      min_price: { type: "number", description: "月租下限（美元）" },
      max_price: { type: "number", description: "月租上限（美元）" },
      amenities: {
        type: "array",
        items: { type: "string" },
        description: "必须全部包含的 amenity；先用 list_amenities 看精确字面量",
      },
      limit: { type: "number", description: "默认 15，上限 30" },
    },
    required: [],
  },
  async execute(input) {
    const admin = getSupabaseAdmin();
    const limit = Math.min(Math.max(input.limit ?? 15, 1), 30);

    let q = admin
      .from("apt_buildings")
      .select(
        "id, name, short_name, address, neighborhood, area, building_slug, year_built, amenities, active_rentals_count, image_url"
      )
      .eq("is_tracked", true);

    // 分词 query
    if (input.query && input.query.trim()) {
      const tokens = input.query
        .trim()
        .split(/\s+/)
        .map((t) => t.replace(/[%,]/g, "").trim())
        .filter((t) => t.length >= 2);
      if (tokens.length > 0) {
        const clauses: string[] = [];
        for (const t of tokens) {
          const p = `%${t}%`;
          clauses.push(
            `name.ilike.${p}`,
            `short_name.ilike.${p}`,
            `neighborhood.ilike.${p}`,
            `address.ilike.${p}`
          );
        }
        q = q.or(clauses.join(","));
      }
    }
    if (input.area) q = q.eq("area", input.area);
    if (input.neighborhood) q = q.ilike("neighborhood", `%${input.neighborhood}%`);
    if (Array.isArray(input.amenities) && input.amenities.length > 0) {
      q = q.contains("amenities", input.amenities);
    }

    // bed / price 过滤要走 listings 表
    const needListingFilter =
      input.min_bed !== undefined ||
      input.max_bed !== undefined ||
      input.min_price !== undefined ||
      input.max_price !== undefined;

    if (needListingFilter) {
      let lq = admin.from("apt_listings").select("building_id").eq("is_active", true);
      if (input.min_bed !== undefined) lq = lq.gte("bedrooms", input.min_bed);
      if (input.max_bed !== undefined) lq = lq.lte("bedrooms", input.max_bed);
      if (input.min_price !== undefined) lq = lq.gte("price_monthly", input.min_price);
      if (input.max_price !== undefined) lq = lq.lte("price_monthly", input.max_price);
      const { data: lids, error: lerr } = await lq.limit(5000);
      if (lerr) return toolError(lerr.message);
      const ids = Array.from(
        new Set(
          (lids ?? [])
            .map((r) => (r as { building_id: string | null }).building_id)
            .filter((x): x is string => !!x)
        )
      );
      if (ids.length === 0) {
        return ok(
          { buildings: [], count: 0 },
          { hint: "没有 listing 匹配 bed/price 条件；告诉用户并建议放宽" }
        );
      }
      q = q.in("id", ids);
    }

    const { data, error } = await q
      .order("active_rentals_count", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) return toolError(error.message);

    const rows = (data ?? []) as Array<{
      id: string;
      name: string;
      short_name: string | null;
      address: string | null;
      neighborhood: string | null;
      area: string;
      building_slug: string | null;
      year_built: number | null;
      amenities: string[] | null;
      active_rentals_count: number | null;
      image_url: string | null;
    }>;

    // 补每栋楼的价格区间
    const ids = rows.map((r) => r.id);
    const priceByBuilding = new Map<string, { min: number; max: number; count: number }>();
    if (ids.length) {
      const { data: lrows } = await admin
        .from("apt_listings")
        .select("building_id, price_monthly")
        .in("building_id", ids)
        .eq("is_active", true);
      for (const l of lrows ?? []) {
        const r = l as { building_id: string | null; price_monthly: number | null };
        if (!r.building_id || r.price_monthly == null) continue;
        const prev = priceByBuilding.get(r.building_id);
        if (prev) {
          prev.min = Math.min(prev.min, r.price_monthly);
          prev.max = Math.max(prev.max, r.price_monthly);
          prev.count += 1;
        } else {
          priceByBuilding.set(r.building_id, {
            min: r.price_monthly,
            max: r.price_monthly,
            count: 1,
          });
        }
      }
    }

    return ok({
      count: rows.length,
      buildings: rows.map((r) => {
        const price = priceByBuilding.get(r.id);
        return {
          id: r.id,
          slug: r.building_slug,
          name: r.name,
          short_name: r.short_name,
          address: r.address,
          neighborhood: r.neighborhood,
          area: r.area,
          year_built: r.year_built,
          active_rentals_count: r.active_rentals_count,
          amenities_preview: (r.amenities ?? []).slice(0, 8),
          image_url: r.image_url,
          price_range: price
            ? { min: price.min, max: price.max, listing_count: price.count }
            : null,
        };
      }),
    });
  },
};
