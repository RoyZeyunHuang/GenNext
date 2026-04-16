"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  areaLabel,
  formatAge,
  formatBaths,
  formatBeds,
  formatDate,
  formatPrice,
  formatSqft,
  tagColor,
  shouldShowTag,
  tagLabel,
  isPlaceholderImage,
} from "./format";
import { CopyButton } from "./CopyButton";
import { effectiveRent, priceAnomaly } from "@/lib/apartments/compute";
import { formatUnitSnippet } from "@/lib/apartments/wechat";
import type { Listing, Building } from "@/lib/apartments/types";

interface UnitRow {
  id: string;
  building_id: string | null;
  url: string;
  unit: string | null;
  address: string | null;
  neighborhood: string | null;
  borough: string | null;
  price_monthly: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  no_fee: boolean;
  furnished: boolean;
  available_at: string | null;
  months_free: number | null;
  lease_term_months: number | null;
  image_url: string | null;
  floor_plan_url: string | null;
  first_seen_at: string;
  last_seen_at?: string;
  is_active?: boolean;
  apt_buildings?: {
    name: string | null;
    tag: string | null;
    area: string | null;
    image_url: string | null;
    building_url?: string | null;
    address?: string | null;
  } | null;
}

function snippetFromRow(u: UnitRow): string {
  // Adapt the row into the Listing+Building shape `formatUnitSnippet` expects.
  const unit = u as unknown as Listing;
  const building: Partial<Building> | null = u.apt_buildings
    ? {
        name: u.apt_buildings.name ?? "",
        building_url: u.apt_buildings.building_url ?? "",
        address: u.apt_buildings.address ?? null,
      } as Partial<Building>
    : null;
  return formatUnitSnippet({ unit, building: building as Building, commutes: null });
}

function AnomalyBadge({ verdict, pctDelta }: { verdict: ReturnType<typeof priceAnomaly>["verdict"]; pctDelta: number | null }) {
  if (verdict === "deal") {
    const pct = Math.abs((pctDelta ?? 0) * 100).toFixed(0);
    return (
      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-800 ring-1 ring-green-200" title="低于本楼中位价">
        ⬇ {pct}%
      </span>
    );
  }
  if (verdict === "overpriced") {
    const pct = Math.abs((pctDelta ?? 0) * 100).toFixed(0);
    return (
      <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800 ring-1 ring-rose-200" title="高于本楼中位价">
        ⬆ {pct}%
      </span>
    );
  }
  return null;
}

export function UnitTable({
  units,
  basePath = "/apartments",
}: {
  units: UnitRow[];
  /** Route prefix for internal nav (unit / building detail links). */
  basePath?: string;
}) {
  const prefix = basePath.replace(/\/$/, "");
  // Group units by building once for anomaly comparison
  const byBuilding = useMemo(() => {
    const m = new Map<string, UnitRow[]>();
    for (const u of units) {
      if (!u.building_id) continue;
      const arr = m.get(u.building_id) ?? [];
      arr.push(u);
      m.set(u.building_id, arr);
    }
    return m;
  }, [units]);

  function anomalyFor(u: UnitRow) {
    const peers = (byBuilding.get(u.building_id ?? "") ?? []).map(p => ({
      id: p.id,
      price_monthly: p.price_monthly,
      bedrooms: p.bedrooms,
      is_active: p.is_active ?? true,
    }));
    return priceAnomaly(
      { id: u.id, price_monthly: u.price_monthly, bedrooms: u.bedrooms, is_active: u.is_active ?? true },
      peers,
    );
  }

  if (units.length === 0)
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        没有符合筛选条件的房源。请放宽条件,或等待明天刷新。
      </div>
    );

  return (
    <>
    {/* Mobile: card list */}
    <div className="divide-y rounded-lg border bg-card md:hidden">
      {units.map((u) => {
        const b = u.apt_buildings;
        const rawImg = u.image_url ?? b?.image_url ?? null;
        const img = isPlaceholderImage(rawImg) ? null : rawImg;
        const eff = effectiveRent(u.price_monthly, u.months_free, u.lease_term_months);
        const an = anomalyFor(u);
        return (
          <Link key={u.id} href={`${prefix}/units/${u.id}`}
            className="flex gap-3 p-3 active:bg-accent/40">
            <div className="h-20 w-24 flex-shrink-0 overflow-hidden rounded bg-muted">
              {img ? (
                <Image src={img} alt="" width={96} height={80} className="h-full w-full object-cover" unoptimized />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-semibold">{formatPrice(u.price_monthly)}</span>
                  <AnomalyBadge verdict={an.verdict} pctDelta={an.pctDelta} />
                </div>
                <span className="text-xs text-muted-foreground">{formatAge(u.first_seen_at)}</span>
              </div>
              {eff && eff !== u.price_monthly && (
                <div className="text-xs text-green-700 font-medium">
                  净租金 {formatPrice(eff)}/月 · 省 {formatPrice(u.price_monthly! - eff)}
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                {formatBeds(u.bedrooms)} · {formatBaths(u.bathrooms) || "—"}
                {u.sqft ? ` · ${formatSqft(u.sqft)}` : ""}
              </div>
              <div className="mt-0.5 truncate text-sm">
                <span className="font-medium">{b?.name ?? u.address}</span>
                {shouldShowTag(b?.tag) && (
                  <span className={cn("ml-1.5 rounded px-1 py-0.5 text-[9px] font-semibold uppercase ring-1", tagColor(b?.tag))}>
                    {tagLabel(b?.tag)}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {u.unit ? `#${u.unit} · ` : ""}{areaLabel(b?.area)}
              </div>
            </div>
          </Link>
        );
      })}
    </div>

    {/* Desktop: table */}
    <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-xs tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">价格</th>
            <th className="px-3 py-2 text-left">净租金</th>
            <th className="px-3 py-2 text-left">户号</th>
            <th className="px-3 py-2 text-left">户型 / 卫浴 / 面积</th>
            <th className="px-3 py-2 text-left">楼盘</th>
            <th className="px-3 py-2 text-left">入住</th>
            <th className="px-3 py-2 text-left">优惠</th>
            <th className="px-3 py-2 text-left">首次出现</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => {
            const b = u.apt_buildings;
            const rawImg = u.image_url ?? b?.image_url ?? null;
        const img = isPlaceholderImage(rawImg) ? null : rawImg;
            const eff = effectiveRent(u.price_monthly, u.months_free, u.lease_term_months);
            const an = anomalyFor(u);
            return (
              <tr
                key={u.id}
                className="border-b last:border-0 hover:bg-accent/40"
              >
                <td className="px-3 py-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-semibold text-foreground">{formatPrice(u.price_monthly)}</span>
                    <AnomalyBadge verdict={an.verdict} pctDelta={an.pctDelta} />
                  </div>
                </td>
                <td className="px-3 py-2">
                  {eff && eff !== u.price_monthly ? (
                    <span className="font-medium text-green-700">{formatPrice(eff)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {img ? (
                      <Image
                        src={img}
                        alt=""
                        width={48}
                        height={36}
                        className="rounded object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="h-9 w-12 rounded bg-muted" />
                    )}
                    <span className="font-medium">{u.unit ?? "—"}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatBeds(u.bedrooms)} · {formatBaths(u.bathrooms) || "—"}{" "}
                  {u.sqft ? `· ${formatSqft(u.sqft)}` : ""}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`${prefix}/buildings/${u.building_id}`}
                      className="font-medium hover:underline"
                    >
                      {b?.name ?? u.address ?? "?"}
                    </Link>
                    {shouldShowTag(b?.tag) && (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1",
                          tagColor(b?.tag)
                        )}
                      >
                        {tagLabel(b?.tag)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {areaLabel(b?.area)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatDate(u.available_at)}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {u.months_free ? `${u.months_free} 个月免租` : ""}
                  {u.lease_term_months ? ` · 签约 ${u.lease_term_months} 个月` : ""}
                  {u.no_fee ? " · 免中介费" : ""}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {formatAge(u.first_seen_at)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <CopyButton text={snippetFromRow(u)} label="微信" copiedLabel="✓" size="xs" />
                    <a
                      href={u.url}
                      target="_blank"
                      rel="noopener"
                      className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-accent"
                      title="在 StreetEasy 打开"
                    >
                      <ExternalLink className="inline h-3 w-3" />
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
