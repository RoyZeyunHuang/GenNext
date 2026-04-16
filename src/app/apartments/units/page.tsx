import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { AreaPills } from "@/components/apartments/AreaPills";
import { FilterBar } from "@/components/apartments/FilterBar";
import { UnitTable } from "@/components/apartments/UnitTable";
import { formatAge } from "@/components/apartments/format";
import type { Area } from "@/lib/apartments/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Unit Search · Apartments" };

type SP = { [k: string]: string | string[] | undefined };

export default async function UnitsPage({ searchParams }: { searchParams: SP }) {
  const currentArea = ((searchParams.area ?? "all") as string) as Area | "all";
  const db = getSupabaseAdmin();

  // Narrow by area
  let buildingIds: string[] | null = null;
  if (currentArea !== "all") {
    const { data: bs } = await db
      .from("apt_buildings")
      .select("id")
      .eq("area", currentArea)
      .eq("is_tracked", true);
    buildingIds = (bs ?? []).map((b: { id: string }) => b.id);
  }

  const beds = (searchParams.beds ?? "") as string;
  const sort = (searchParams.sort ?? "newest") as string;

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
  const bedsArr = beds.split(",").map(Number).filter((n) => !Number.isNaN(n));
  if (bedsArr.length > 0) q = q.in("bedrooms", bedsArr);
  if (searchParams.min_price) q = q.gte("price_monthly", Number(searchParams.min_price));
  if (searchParams.max_price) q = q.lte("price_monthly", Number(searchParams.max_price));
  if (searchParams.no_fee === "1") q = q.eq("no_fee", true);
  if (searchParams.move_in_after) q = q.gte("available_at", searchParams.move_in_after as string);

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
    default:
      q = q.order("first_seen_at", { ascending: false });
  }
  q = q.range(0, 199);

  const { data: units, count } = await q;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-3 py-4 lg:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Unit Search</h1>
          <p className="text-sm text-muted-foreground">
            {count ?? 0} units · agent 快速查询视图
          </p>
        </div>
        <Link href="/apartments" className="rounded border px-3 py-1 text-xs hover:bg-accent">
          ← Buildings
        </Link>
      </header>
      <AreaPills current={currentArea} basePath="/apartments/units" />
      <FilterBar />
      <UnitTable units={(units ?? []) as never[]} />
    </div>
  );
}
