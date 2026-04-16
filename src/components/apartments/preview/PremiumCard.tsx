import Link from "next/link";
import Image from "next/image";
import { Sparkles, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  areaLabel,
  effectiveBuildingImage,
  shouldShowTag,
  tagColor,
  tagLabel,
} from "@/components/apartments/format";
import { CompareToggle } from "@/components/apartments/CompareBar";
import { SubwayBadge } from "@/components/apartments/SubwayBadge";
import { bedMixLabel, priceRangeLabel, bedShort } from "@/lib/apartments/preview-stats";
import type { BuildingStats, MatchResult } from "@/lib/apartments/preview-stats";

export interface PremiumBuilding {
  id: string;
  name: string;
  address: string | null;
  area: string;
  tag: string | null;
  building_slug: string | null;
  image_url: string | null;
  fallback_image_urls?: Array<string | null> | null;
  year_built: number | null;
  amenities: string[] | null;
}

/** Pick up to 3 amenity highlights for the card chip row.
 *  Priority: pool → gym → roofdeck → doorman → garden → pet → parking. */
function topAmenityChips(amenities: string[] | null): { emoji: string; label: string }[] {
  const set = new Set(amenities ?? []);
  const order: Array<{ id: string; emoji: string; label: string }> = [
    { id: "pool", emoji: "🏊", label: "泳池" },
    { id: "gym", emoji: "🏋", label: "健身房" },
    { id: "roofdeck", emoji: "🌆", label: "屋顶平台" },
    { id: "full_time_doorman", emoji: "🚪", label: "全天门卫" },
    { id: "doorman", emoji: "🚪", label: "门卫" },
    { id: "garden", emoji: "🌳", label: "花园" },
    { id: "dogs", emoji: "🐕", label: "可养狗" },
    { id: "valet_parking", emoji: "🅿", label: "代客泊车" },
    { id: "parking", emoji: "🅿", label: "停车" },
  ];
  const picked: { emoji: string; label: string }[] = [];
  for (const a of order) {
    if (set.has(a.id) && picked.length < 3) {
      picked.push({ emoji: a.emoji, label: a.label });
    }
  }
  return picked;
}

function safeSlug(b: PremiumBuilding): string {
  if (b.building_slug) return b.building_slug;
  const m = b.id.match(/\/building\/(.+?)$/);
  if (m) return m[1];
  return encodeURIComponent(b.id);
}

export function PremiumCard({
  building,
  stats,
  match,
  basePath = "/apartments",
}: {
  building: PremiumBuilding;
  stats: BuildingStats;
  /** When the agent has filled out a client brief, this drives the
   *  "为什么匹配 / 不匹配" panel. null = no brief active. */
  match?: MatchResult | null;
  /** Route prefix for the detail link. Defaults to the main /apartments
   *  tree; pass "/rednote-factory/apartments" from the RF shell. */
  basePath?: string;
}) {
  const heroImage = effectiveBuildingImage(
    building.image_url,
    building.fallback_image_urls ?? [],
  );
  const chips = topAmenityChips(building.amenities);
  const hasPromo = stats.maxFreeMonths >= 0.5 || stats.anyNoFee;
  const slug = safeSlug(building);
  const detailHref = `${basePath.replace(/\/$/, "")}/buildings/${slug}`;

  // Show match badge when brief is set and the building has anything to score
  const showMatch = match != null && match.total > 0;
  const matchPct = showMatch ? match!.score / match!.total : 0;

  // Neutral palette: indigo for full / good match, slate for partial,
  // muted for poor — no green.
  const matchTone =
    matchPct >= 0.75 ? "border-indigo-200 bg-indigo-50/60 text-indigo-950"
    : matchPct >= 0.5 ? "border-slate-300 bg-slate-50 text-slate-800"
    : "border-slate-200 bg-slate-50/60 text-slate-600";

  const matchScoreTone =
    matchPct >= 0.75 ? "border-indigo-300 bg-indigo-100 text-indigo-900"
    : matchPct >= 0.5 ? "border-slate-400 bg-white text-slate-800"
    : "border-slate-300 bg-white text-slate-500";

  return (
    <Link
      href={detailHref}
      // Mobile: horizontal (left image / right info) for info density.
      // Tablet+: vertical tall-image card for visual appeal when multi-column.
      className="group flex flex-row overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99] md:flex-col"
    >
      {/* Hero photo — mobile square 144x144, md+ full-width 4:3 */}
      <div
        className={cn(
          "relative block flex-shrink-0 self-stretch overflow-hidden bg-muted",
          // Mobile: fixed 144×144 tile.
          "w-36 aspect-square",
          // md+: full width, 4:3.
          "md:w-full md:aspect-[4/3] md:self-auto",
        )}
      >
        {heroImage ? (
          <Image
            src={heroImage}
            alt=""
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            unoptimized
            sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 144px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            暂无照片
          </div>
        )}

        {/* Top-left: compare toggle */}
        <CompareToggle
          id={building.id}
          className="!top-2 !left-2 !h-7 !w-7 backdrop-blur-md !bg-white/85 md:!top-3 md:!left-3 md:!h-8 md:!w-8"
        />

        {/* Top-right: NEW tag */}
        {shouldShowTag(building.tag) && (
          <span
            className={cn(
              "absolute top-2 right-2 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider shadow-sm ring-1 backdrop-blur-md md:top-3 md:right-3 md:px-2.5 md:py-1 md:text-[10px]",
              tagColor(building.tag),
            )}
          >
            {tagLabel(building.tag)}
          </span>
        )}

        {/* Bottom-left: dynamic activity */}
        {stats.freshCount >= 2 && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-rose-500/95 px-2 py-0.5 text-[9px] font-bold text-white shadow-sm md:bottom-3 md:left-3 md:px-2.5 md:py-1 md:text-[10px]">
            <Sparkles className="h-2.5 w-2.5 md:h-3 md:w-3" /> 本周新上 {stats.freshCount}
          </span>
        )}
      </div>

      {/* Body — tighter spacing on mobile */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 md:gap-3.5 md:p-5">
        {/* Title + match score */}
        <div className="flex items-start justify-between gap-2 md:gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold tracking-tight text-foreground md:text-lg">
              {building.name}
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground md:text-xs">
              {areaLabel(building.area)}
              {building.year_built ? ` · ${building.year_built}年` : ""}
              <span className="hidden md:inline"> · {building.address ?? "—"}</span>
            </p>
          </div>
          {showMatch && (
            <div
              className={cn(
                "flex flex-shrink-0 flex-col items-center justify-center rounded-lg border px-1.5 py-0.5 md:px-2 md:py-1",
                matchScoreTone,
              )}
            >
              <div className="text-sm font-bold tabular-nums leading-none md:text-base">
                {match!.score}
              </div>
              <div className="text-[8px] uppercase opacity-70 md:text-[9px]">
                / {match!.total}
              </div>
            </div>
          )}
        </div>

        {/* Match reasons (when brief active) */}
        {showMatch && (
          <div
            className={cn(
              "space-y-0.5 rounded-lg border p-2 text-[10px] md:space-y-1 md:p-2.5 md:text-[11px]",
              matchTone,
            )}
          >
            {match!.reasons.map((r) => (
              <div key={r.label} className="flex items-start gap-1 md:gap-1.5">
                {r.ok ? (
                  <Check className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 text-indigo-700 md:h-3 md:w-3" />
                ) : (
                  <X className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 text-rose-500 md:h-3 md:w-3" />
                )}
                <span className="leading-snug">
                  <strong className="font-semibold">{r.label}</strong>
                  <span className="ml-1 opacity-80">{r.detail}</span>
                </span>
              </div>
            ))}
            {match!.commuteMinutes != null && match!.commuteLines.length > 0 && (
              <div className="mt-1 flex items-center gap-1 border-t border-current/10 pt-1 md:gap-1.5 md:pt-1.5">
                {match!.commuteLines.map((line, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-[10px] opacity-50 md:text-xs">→</span>}
                    <SubwayBadge route={line} size="xs" />
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Price block */}
        <div className="md:border-t md:pt-3">
          {stats.minPrice != null ? (
            <>
              {match?.bestPrice != null && match.bestPriceBeds != null && (
                <div className="text-[10px] text-muted-foreground md:text-[11px]">
                  {bedShort(match.bestPriceBeds)} 起价
                </div>
              )}
              <div className="flex items-baseline gap-1 md:gap-1.5">
                <span className="text-lg font-bold tracking-tight tabular-nums text-foreground md:text-2xl">
                  {match?.bestPrice != null
                    ? `$${match.bestPrice.toLocaleString()}`
                    : priceRangeLabel(stats.minPrice, stats.maxPrice)}
                </span>
                <span className="text-[11px] text-muted-foreground md:text-xs">/月</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground md:mt-1 md:text-xs">
                <span className="font-semibold text-primary">{stats.count}</span> 套在租
                {stats.bedMix.length > 0 && <> · {bedMixLabel(stats.bedMix)}</>}
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground md:text-sm">暂无在租房源</div>
          )}
        </div>

        {/* Amenity chips — show 2 on mobile (density), 3 on md+ */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1 md:gap-1.5">
            {chips.slice(0, 2).map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-0.5 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-foreground md:gap-1 md:px-2.5 md:py-1 md:text-[11px]"
              >
                <span>{c.emoji}</span>
                <span>{c.label}</span>
              </span>
            ))}
            {chips.length > 2 && (
              <span className="hidden items-center gap-0.5 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-foreground md:inline-flex md:gap-1 md:px-2.5 md:py-1 md:text-[11px]">
                <span>{chips[2].emoji}</span>
                <span>{chips[2].label}</span>
              </span>
            )}
          </div>
        )}

        {/* Promo banner — pinned to bottom on desktop (col layout); inline on mobile */}
        {hasPromo && (
          <div className="rounded-md border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-2 py-1 md:mt-auto md:rounded-lg md:px-3 md:py-2">
            <div className="flex items-center justify-between gap-2 text-xs md:text-sm">
              <div className="flex items-center gap-1 font-medium text-amber-900 md:gap-2">
                💰{" "}
                {stats.maxFreeMonths >= 0.5 ? (
                  <>最多 <span className="tabular-nums">{stats.maxFreeMonths}</span> 月免租</>
                ) : (
                  "免中介费"
                )}
              </div>
              {stats.minEffective != null && stats.minPrice != null && stats.minEffective < stats.minPrice && (
                <div className="text-[10px] text-amber-800 md:text-xs">
                  净 ${stats.minEffective.toLocaleString()}起
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
