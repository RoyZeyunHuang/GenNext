import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { AreaPills } from "@/components/apartments/AreaPills";
import { BuildingCard } from "@/components/apartments/BuildingCard";
import { formatAge } from "@/components/apartments/format";
import type { Area } from "@/lib/apartments/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Apartments · Buildings" };

type SP = { [k: string]: string | string[] | undefined };

const TAG_ORDER: Record<string, number> = {
  new_2026: 0,
  new_2025: 1,
  new_2024: 2,
  new_2023: 3,
  core: 4,
  legacy: 5,
};

export default async function ApartmentsPage({
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
        "year_built, floor_count, unit_count, note, is_new_development"
    )
    .eq("is_tracked", true);
  if (currentArea !== "all") q = q.eq("area", currentArea);

  const [{ data }, runQ] = await Promise.all([
    q,
    db
      .from("apt_refresh_runs")
      .select("finished_at, status, listings_new")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

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
  const lastRun = runQ.data;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-3 py-4 lg:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold sm:text-2xl">Apartments</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            留学生热门楼 · {buildings.length} tracked · {totalAvail} units
            {lastRun?.finished_at && (
              <> · scan {formatAge(lastRun.finished_at)}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/apartments/units"
            className="rounded border px-3 py-1.5 text-xs hover:bg-accent active:bg-accent/60"
          >
            Unit search →
          </Link>
          <Link
            href="/apartments/admin"
            className="rounded border px-3 py-1.5 text-xs hover:bg-accent active:bg-accent/60"
          >
            Admin
          </Link>
        </div>
      </header>

      <AreaPills current={currentArea} basePath="/apartments" />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {buildings.map((b) => (
          <BuildingCard key={b.id} building={b as never} />
        ))}
      </div>
    </div>
  );
}
