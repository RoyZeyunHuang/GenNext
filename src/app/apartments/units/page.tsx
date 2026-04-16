import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { UnitTable } from "@/components/apartments/UnitTable";
import { ViewToggle } from "@/components/apartments/preview/ViewToggle";
import { PreviewFilterRow } from "@/components/apartments/preview/PreviewFilterRow";
import { UnitFilterPanel } from "@/components/apartments/preview/UnitFilterPanel";
import type { Area } from "@/lib/apartments/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "房源搜索 · 公寓" };

type SP = { [k: string]: string | string[] | undefined };

const UNIT_SORT_OPTIONS = [
  { value: "newest", label: "最新" },
  { value: "price_asc", label: "价低" },
  { value: "price_desc", label: "价高" },
  { value: "move_in", label: "入住近" },
  { value: "eff_rent_asc", label: "净租金低" },
];

export default async function UnitsPage({ searchParams }: { searchParams: SP }) {
  const currentArea = ((searchParams.area ?? "all") as string) as Area | "all";
  const db = getSupabaseAdmin();

  const sort = (searchParams.sort ?? "newest") as string;
  const bedsMin = numParam(searchParams.beds_min);
  const bedsMax = numParam(searchParams.beds_max);
  const minPrice = numParam(searchParams.min_price);
  const maxPrice = numParam(searchParams.max_price);
  const moveIn = typeof searchParams.move_in === "string" ? searchParams.move_in : null;

  // Narrow by area to building IDs first (we still need this hop because
  // listings store area on the joined building, not directly).
  let buildingIds: string[] | null = null;
  if (currentArea !== "all") {
    const { data: bs } = await db
      .from("apt_buildings")
      .select("id")
      .eq("is_tracked", true)
      .eq("area", currentArea);
    buildingIds = ((bs ?? []) as Array<{ id: string }>).map((b) => b.id);
  }

  let q = db
    .from("apt_listings")
    .select(
      "id, building_id, url, unit, address, neighborhood, borough, " +
        "price_monthly, bedrooms, bathrooms, sqft, no_fee, furnished, " +
        "available_at, months_free, lease_term_months, image_url, floor_plan_url, " +
        "first_seen_at, apt_buildings(name, tag, area, official_url, image_url)",
      { count: "exact" }
    )
    .eq("is_active", true);

  if (buildingIds) q = q.in("building_id", buildingIds);
  if (bedsMin != null) q = q.gte("bedrooms", bedsMin);
  // 4卧+ means "anything 4 or higher", so we only apply the upper bound
  // when the user dialed it strictly below the max.
  if (bedsMax != null && bedsMax < 4) q = q.lte("bedrooms", bedsMax);
  if (minPrice != null) q = q.gte("price_monthly", minPrice);
  if (maxPrice != null) q = q.lte("price_monthly", maxPrice);
  if (moveIn) q = q.lte("available_at", moveIn);

  switch (sort) {
    case "price_asc":
      q = q.order("price_monthly", { ascending: true, nullsFirst: false });
      break;
    case "price_desc":
      q = q.order("price_monthly", { ascending: false, nullsFirst: false });
      break;
    case "move_in":
      q = q.order("available_at", { ascending: true, nullsFirst: false });
      break;
    case "eff_rent_asc":
      // Postgres can't easily sort by computed eff rent — fetch wider and re-sort in JS
      q = q.order("price_monthly", { ascending: true, nullsFirst: false });
      break;
    default:
      q = q.order("first_seen_at", { ascending: false });
  }
  q = q.range(0, 199);

  type UnitRow = { price_monthly: number | null; months_free: number | null; lease_term_months: number | null };
  const queryResult = await q;
  const count = queryResult.count;
  let units = (Array.isArray(queryResult.data) ? queryResult.data : []) as unknown as UnitRow[];
  if (sort === "eff_rent_asc") {
    const { effectiveRent } = await import("@/lib/apartments/compute");
    units = units.slice().sort((a, b) => {
      const ea = effectiveRent(a.price_monthly, a.months_free, a.lease_term_months) ?? a.price_monthly ?? Infinity;
      const eb = effectiveRent(b.price_monthly, b.months_free, b.lease_term_months) ?? b.price_monthly ?? Infinity;
      return ea - eb;
    });
  }

  // Build query string for view toggle so filter state round-trips
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string" && v) qs.set(k, v);
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-3 py-3 md:gap-4 md:py-4 lg:p-8">
      {/* ROW 1: SAME chips as buildings view + view toggle */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 py-2">
        <PreviewFilterRow
          currentArea={currentArea}
          currentSort={sort}
          sortOptions={UNIT_SORT_OPTIONS}
          clearSortOnValues={["newest"]}
        />
        <div className="ml-auto">
          <ViewToggle current="units" searchParamsString={qs.toString()} />
        </div>
      </div>

      {/* ROW 2: filter panel with sliders */}
      <UnitFilterPanel resultCount={count ?? 0} />

      {/* RESULTS */}
      <UnitTable units={(units ?? []) as never[]} />
    </div>
  );
}

function numParam(v: string | string[] | undefined): number | null {
  if (typeof v !== "string" || !v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
