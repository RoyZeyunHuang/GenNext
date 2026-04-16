import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { AreaPills } from "@/components/apartments/AreaPills";
import { BuildingCard } from "@/components/apartments/BuildingCard";
import { CompareBar } from "@/components/apartments/CompareBar";
import type { Area } from "@/lib/apartments/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "楼盘 · 公寓" };

type SP = { [k: string]: string | string[] | undefined };

const TAG_ORDER: Record<string, number> = {
  new_2026: 0,
  new_2025: 1,
  new_2024: 2,
  new_2023: 3,
  core: 4,
  legacy: 5,
};

export default async function BuildingsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const currentArea = ((searchParams.area ?? "all") as string) as Area | "all";
  const db = getSupabaseAdmin();

  let q = db
    .from("apt_buildings")
    .select(
      "id, name, address, neighborhood, borough, area, tag, building_slug, image_url, " +
        "active_rentals_count, open_rentals_count, closed_rentals_count, " +
        "year_built, floor_count, unit_count, note, is_new_development, " +
        "amenities, subways"
    )
    .eq("is_tracked", true);
  if (currentArea !== "all") q = q.eq("area", currentArea);

  const { data } = await q;
  const buildings = (data ?? []).slice().sort((a, b) => {
    const ta = TAG_ORDER[a.tag ?? "legacy"] ?? 9;
    const tb = TAG_ORDER[b.tag ?? "legacy"] ?? 9;
    if (ta !== tb) return ta - tb;
    const aAvail = a.open_rentals_count ?? a.active_rentals_count ?? 0;
    const bAvail = b.open_rentals_count ?? b.active_rentals_count ?? 0;
    return bAvail - aAvail;
  });

  const totalAvail = buildings.reduce(
    (sum, b) => sum + (b.open_rentals_count ?? b.active_rentals_count ?? 0),
    0
  );

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">楼盘</h1>
          <p className="text-sm text-muted-foreground">
            跟踪 {buildings.length} 栋 · 当前视图共 {totalAvail} 套在租
          </p>
        </div>
        <Link
          href="/apartments"
          className="rounded border px-3 py-1 text-xs hover:bg-accent"
        >
          ← 返回房源视图
        </Link>
      </header>

      <AreaPills current={currentArea} basePath="/apartments/buildings" />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {buildings.map((b) => (
          <BuildingCard key={b.id} building={b as never} />
        ))}
      </div>
      <CompareBar />
    </div>
  );
}
