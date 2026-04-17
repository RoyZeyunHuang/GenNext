import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { invalidInput, notFound, ok, type Tool } from "../types";

type Input = { listing_id?: string };

export const getListingTool: Tool<Input> = {
  name: "get_listing",
  description:
    "按 listing id 拉单户型详情。status=ok/not_found。listing_id 必填，来自 get_building.active_listings[].id 或 search_buildings 后续展开。",
  input_schema: {
    type: "object" as const,
    properties: {
      listing_id: { type: "string" },
    },
    required: ["listing_id"],
  },
  async execute(input) {
    const id = (input.listing_id ?? "").trim();
    if (!id) return invalidInput("listing_id 必填");
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from("apt_listings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!data) return notFound(`listing ${id}`);
    return ok({ listing: data });
  },
};
