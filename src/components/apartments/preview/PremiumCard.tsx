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
}: {
  building: PremiumBuilding;
  stats: BuildingStats;
  /** When the agent has filled out a client brief, this drives the
   *  "为什么匹配 / 不匹配" panel. null = no brief active. */
  match?: MatchResult | null;
}) {
  const heroImage = effectiveBuildingImage(
    building.image_url,
    building.fallback_image_urls ?? [],
  );
  const chips = topAmenityChips(building.amenities);
  const hasPromo = stats.maxFreeMonths >= 0.5 || stats.anyNoFee;
  const slug = safeSlug(building);
  const detailHref = `/apartments/buildings/${slug}`;

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
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]"
    >
      {/* Hero photo */}
      <div className="relative block aspect-[4/3] w-full overflow-hidden bg-muted">
        {heroImage ? (
          <Image
            src={heroImage}
            alt=""
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            unoptimized
            sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            暂无照片
          </div>
        )}

        {/* Top-left: compare toggle */}
        <CompareToggle
          id={building.id}
          className="!h-8 !w-8 !top-3 !left-3 backdrop-blur-md !bg-white/80"
        />

        {/* Top-right: NEW tag */}
        {shouldShowTag(building.tag) && (
          <span
            className={cn(
              "absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider shadow-sm ring-1 backdrop-blur-md",
              tagColor(building.tag),
            )}
          >
            {tagLabel(building.tag)}
          </span>
        )}

        {/* Bottom-left: dynamic activity */}
        {stats.freshCount >= 2 && (
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-rose-500/95 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
            <Sparkles className="h-3 w-3" /> 本周新上 {stats.freshCount} 套
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3.5 p-5">
        {/* Title + match score (when brief active) */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {building.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {building.address ?? "—"} · {areaLabel(building.area)}
              {building.year_built ? ` · ${building.year_built}年` : ""}
            </p>
          </div>
          {showMatch && (
            <div
              className={cn(
                "flex flex-shrink-0 flex-col items-center justify-center rounded-lg border px-2 py-1",
                matchScoreTone,
              )}
            >
              <div className="text-base font-bold tabular-nums leading-none">
                {match!.score}
              </div>
              <div className="text-[9px] uppercase opacity-70">/ {match!.total}</div>
            </div>
          )}
        </div>

        {/* Match reasons (when brief active) */}
        {showMatch && (
          <div
            className={cn(
              "rounded-lg border p-2.5 text-[11px] space-y-1",
              matchTone,
            )}
          >
            {match!.reasons.map((r) => (
              <div key={r.label} className="flex items-start gap-1.5">
                {r.ok ? (
                  <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-indigo-700" />
                ) : (
                  <X className="mt-0.5 h-3 w-3 flex-shrink-0 text-rose-500" />
                )}
                <span>
                  <strong className="font-semibold">{r.label}</strong>
                  <span className="ml-1 opacity-80">{r.detail}</span>
                </span>
              </div>
            ))}
            {match!.commuteMinutes != null && match!.commuteLines.length > 0 && (
              <div className="mt-1 flex items-center gap-1.5 border-t border-current/10 pt-1.5">
                {match!.commuteLines.map((line, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-xs opacity-50">→</span>}
                    <SubwayBadge route={line} size="sm" />
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Price block */}
        <div className="border-t pt-3">
          {stats.minPrice != null ? (
            <>
              {match?.bestPrice != null && match.bestPriceBeds != null && (
                <div className="text-[11px] text-muted-foreground">
                  {bedShort(match.bestPriceBeds)} 起价
                </div>
              )}
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                  {match?.bestPrice != null
                    ? `$${match.bestPrice.toLocaleString()}`
                    : priceRangeLabel(stats.minPrice, stats.maxPrice)}
                </span>
                <span className="text-xs text-muted-foreground">/月</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                <span className="font-semibold text-primary">{stats.count}</span> 套在租
                {stats.bedMix.length > 0 && <> · {bedMixLabel(stats.bedMix)}</>}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">暂无在租房源</div>
          )}
        </div>

        {/* Amenity chips */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground"
              >
                <span>{c.emoji}</span>
                <span>{c.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* Promo banner — pinned to bottom of body when present */}
        {hasPromo && (
          <div className="mt-auto rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 font-medium text-amber-900">
                💰{" "}
                {stats.maxFreeMonths >= 0.5
                  ? <>最多 <span className="tabular-nums">{stats.maxFreeMonths}</span> 个月免租</>
                  : "免中介费"}
              </div>
              {stats.minEffective != null && stats.minPrice != null && stats.minEffective < stats.minPrice && (
                <div className="text-xs text-amber-800">
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
