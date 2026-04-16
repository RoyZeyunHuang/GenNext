import { Filter } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { PreviewFilterRow } from "@/components/apartments/preview/PreviewFilterRow";
import { ViewToggle } from "@/components/apartments/preview/ViewToggle";
import { CompareBar } from "@/components/apartments/CompareBar";
import {
  computeBuildingStats,
  computeMatch,
  briefIsActive,
  type BuildingStats,
  type ClientBrief,
  type MatchResult,
  type MatchListing,
} from "@/lib/apartments/preview-stats";
import type { Listing, Area } from "@/lib/apartments/types";
import type { CommuteResult } from "@/lib/apartments/commute";
import {
  PremiumCard,
  type PremiumBuilding,
} from "@/components/apartments/preview/PremiumCard";
import { ClientBriefBar } from "@/components/apartments/preview/ClientBriefBar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "公寓 · 楼盘" };

type SP = { [k: string]: string | string[] | undefined };

const TAG_ORDER: Record<string, number> = {
  new_2026: 0, new_2025: 1, new_2024: 2, new_2023: 3, core: 4, legacy: 5,
};

type RawBldg = PremiumBuilding & {
  tag: string | null;
  open_rentals_count: number | null;
  active_rentals_count: number | null;
  commutes?: CommuteResult[] | null;
};

/** Serialize SP back to a "k=v&k=v" string for view-toggle deep links. */
function sp2qs(sp: SP): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v) params.set(k, v);
  }
  return params.toString();
}

function parseBrief(sp: SP): ClientBrief {
  const num = (k: keyof SP) => {
    const v = sp[k];
    if (typeof v !== "string") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    school: typeof sp.school === "string" && sp.school ? sp.school : null,
    budgetMax: num("budget"),
    beds: num("beds"),
    moveInBy: typeof sp.move_in === "string" && sp.move_in ? sp.move_in : null,
  };
}

export default async function ApartmentsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const currentArea = ((searchParams.area ?? "all") as string) as Area | "all";
  const sortMode = (searchParams.sort as string) ?? "default";
  const brief = parseBrief(searchParams);
  const briefActive = briefIsActive(brief);
  const db = getSupabaseAdmin();

  // 1. Pull tracked buildings (+ commutes for school matching)
  let q = db
    .from("apt_buildings")
    .select(
      "id, name, address, area, tag, building_slug, image_url, " +
        "active_rentals_count, open_rentals_count, " +
        "year_built, amenities, commutes",
    )
    .eq("is_tracked", true);
  if (currentArea !== "all") q = q.eq("area", currentArea);

  const { data: rawBldgs } = await q;
  const buildings = (Array.isArray(rawBldgs) ? rawBldgs : []) as unknown as RawBldg[];

  // 2. Pull all active listings for stats / match / fallback images
  const ids = buildings.map((b) => b.id);
  const statsById = new Map<string, BuildingStats>();
  const matchById = new Map<string, MatchResult>();
  const listingsByBldg = new Map<string, Listing[]>();
  const fallbackImageIds = new Map<string, string[]>();

  if (ids.length > 0) {
    const { data: listings } = await db
      .from("apt_listings")
      .select(
        "building_id, price_monthly, bedrooms, months_free, lease_term_months, " +
          "no_fee, first_seen_at, available_at, image_url",
      )
      .in("building_id", ids)
      .eq("is_active", true)
      .limit(2000);
    const lst = (Array.isArray(listings) ? listings : []) as unknown as Listing[];
    for (const l of lst) {
      if (!l.building_id) continue;
      const arr = listingsByBldg.get(l.building_id) ?? [];
      arr.push(l);
      listingsByBldg.set(l.building_id, arr);
      if (l.image_url) {
        const imgs = fallbackImageIds.get(l.building_id) ?? [];
        if (imgs.length < 4) imgs.push(l.image_url);
        fallbackImageIds.set(l.building_id, imgs);
      }
    }
    for (const b of buildings) {
      const ls = listingsByBldg.get(b.id) ?? [];
      statsById.set(b.id, computeBuildingStats(ls));
      if (briefActive) {
        let commute: { minutes: number | null; lines: string[] } | null = null;
        if (brief.school && Array.isArray(b.commutes)) {
          const hit = b.commutes.find((c) => c.campusShortName === brief.school);
          if (hit?.transit) {
            commute = {
              minutes: hit.transit.durationMinutes,
              lines: hit.transit.lines ?? [],
            };
          }
        }
        const matchListings: MatchListing[] = ls.map((l) => ({
          price_monthly: l.price_monthly,
          bedrooms: l.bedrooms,
          available_at: l.available_at,
          months_free: l.months_free,
          lease_term_months: l.lease_term_months,
          no_fee: l.no_fee,
        }));
        matchById.set(b.id, computeMatch(matchListings, brief, commute));
      }
    }
  }

  // 3. Decorate + sort
  const decorated: PremiumBuilding[] = buildings.map((b) => ({
    ...b,
    fallback_image_urls: fallbackImageIds.get(b.id) ?? [],
  }));

  const effectiveSort = briefActive && sortMode === "default" ? "match" : sortMode;

  function sortKey(b: RawBldg): number {
    const stats = statsById.get(b.id);
    const match = matchById.get(b.id);
    switch (effectiveSort) {
      case "match":
        if (match && match.total > 0) {
          const frac = match.score / match.total;
          return -(frac * 1000 + match.score);
        }
        return 0;
      case "price_low":
        return stats?.minPrice ?? Number.POSITIVE_INFINITY;
      case "price_high":
        return -(stats?.maxPrice ?? 0);
      case "available":
        return -(b.open_rentals_count ?? b.active_rentals_count ?? 0);
      case "promo":
        return -(stats?.maxFreeMonths ?? 0);
      case "newest":
        return TAG_ORDER[b.tag ?? "legacy"] ?? 9;
      default:
        return (TAG_ORDER[b.tag ?? "legacy"] ?? 9) * 1000
          - (b.open_rentals_count ?? b.active_rentals_count ?? 0);
    }
  }

  const sorted = decorated
    .map((b, i) => ({ b, raw: buildings[i] }))
    .sort((a, b) => sortKey(a.raw) - sortKey(b.raw))
    .map((x) => x.b);

  // "Matched" count = buildings with score / total >= 0.5 when brief is active
  const matchedCount = briefActive
    ? Array.from(matchById.values()).filter(
        (m) => m.total > 0 && m.score / m.total >= 0.5,
      ).length
    : undefined;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-3 py-3 md:gap-4 md:py-4 lg:p-8">
      {/* ROW 1: AREA + SORT + VIEW TOGGLE — sticky transparent, chips float on shadow. */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 py-2">
        <PreviewFilterRow
          currentArea={currentArea}
          currentSort={effectiveSort}
          briefActive={briefActive}
        />
        <div className="ml-auto">
          <ViewToggle current="buildings" searchParamsString={sp2qs(searchParams)} />
        </div>
      </div>

      {/* ROW 2: CLIENT BRIEF BAR */}
      <ClientBriefBar matchedCount={matchedCount} />

      {/* GRID */}
      {sorted.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((b) => (
            <PremiumCard
              key={b.id}
              building={b}
              stats={statsById.get(b.id) ?? {
                count: 0, minPrice: null, maxPrice: null,
                bedMix: [], maxFreeMonths: 0, anyNoFee: false,
                freshCount: 0, minEffective: null,
              }}
              match={briefActive ? (matchById.get(b.id) ?? null) : null}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-12 text-center text-sm text-muted-foreground">
          <Filter className="mx-auto mb-3 h-8 w-8 opacity-40" />
          没有符合条件的楼盘。请放宽筛选。
        </div>
      )}

      <CompareBar />
    </div>
  );
}
