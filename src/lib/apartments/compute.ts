/**
 * Pure computation helpers for apartments. No DB writes, no I/O.
 * Used across building/listing pages to surface "agent-useful" derived data.
 */

import type { Listing, Building } from "./types";

// --------------------------------------------------------------------- //
//                          Effective Rent                               //
// --------------------------------------------------------------------- //
/**
 * Real monthly out-of-pocket after concessions, given a {months_free}-month
 * promotion on a {lease_term_months}-month lease.
 *
 *   effective = price * (lease - free) / lease
 *
 * Returns null when we don't have enough info; never lies.
 */
export function effectiveRent(
  price: number | null | undefined,
  monthsFree: number | null | undefined,
  leaseTermMonths: number | null | undefined
): number | null {
  if (price == null || price <= 0) return null;
  if (!monthsFree || !leaseTermMonths || leaseTermMonths <= 0) return price;
  if (monthsFree >= leaseTermMonths) return null; // bad data
  return Math.round((price * (leaseTermMonths - monthsFree)) / leaseTermMonths);
}

/**
 * Savings vs face price ($). Useful for "you save $XXX/mo" copy.
 */
export function effectiveSavings(
  price: number | null | undefined,
  monthsFree: number | null | undefined,
  leaseTermMonths: number | null | undefined
): number {
  const eff = effectiveRent(price, monthsFree, leaseTermMonths);
  if (eff == null || price == null) return 0;
  return Math.max(0, price - eff);
}

// --------------------------------------------------------------------- //
//                        Pricing Anomaly                                //
// --------------------------------------------------------------------- //
export type AnomalyVerdict = "deal" | "neutral" | "overpriced" | "insufficient_data";

export interface PriceAnomaly {
  verdict: AnomalyVerdict;
  unitPrice: number | null;
  buildingMedian: number | null;
  pctDelta: number | null;          // (unit - median) / median, e.g. -0.08 = 8% below
  sampleSize: number;               // peer units used for median
}

/**
 * Compare a unit's price against the median of all *active* same-bed-count
 * units in the same building. Treats < 3 peers as insufficient.
 *
 *   verdict: deal       (≤ 90% of median)
 *            overpriced (≥ 110% of median)
 *            neutral    (within ±10%)
 */
export function priceAnomaly(
  unit: Pick<Listing, "id" | "price_monthly" | "bedrooms" | "is_active">,
  peers: Array<Pick<Listing, "id" | "price_monthly" | "bedrooms" | "is_active">>,
): PriceAnomaly {
  const price = unit.price_monthly ?? null;
  if (price == null) {
    return { verdict: "insufficient_data", unitPrice: null, buildingMedian: null, pctDelta: null, sampleSize: 0 };
  }
  const sameBedPeers = peers.filter(
    (p) =>
      p.id !== unit.id &&
      p.is_active &&
      p.bedrooms != null &&
      unit.bedrooms != null &&
      p.bedrooms === unit.bedrooms &&
      p.price_monthly != null,
  );
  const sample = sameBedPeers.map((p) => p.price_monthly!).sort((a, b) => a - b);
  if (sample.length < 3) {
    return { verdict: "insufficient_data", unitPrice: price, buildingMedian: null, pctDelta: null, sampleSize: sample.length };
  }
  const mid = Math.floor(sample.length / 2);
  const median = sample.length % 2 === 0 ? (sample[mid - 1] + sample[mid]) / 2 : sample[mid];
  const delta = (price - median) / median;
  let verdict: AnomalyVerdict = "neutral";
  if (delta <= -0.1) verdict = "deal";
  else if (delta >= 0.1) verdict = "overpriced";
  return { verdict, unitPrice: price, buildingMedian: Math.round(median), pctDelta: delta, sampleSize: sample.length };
}

// --------------------------------------------------------------------- //
//                          Building Labels                              //
// --------------------------------------------------------------------- //
export interface BuildingLabel {
  id: string;
  short: string;          // e.g. "NEW"
  emoji: string;
  tooltip: string;
  className: string;      // tailwind classes
}

/**
 * Auto-tags for a building card. Keep these computed (not stored) so they
 * always reflect current data.
 */
export function buildingLabels(
  building: Pick<Building, "tag" | "year_built" | "amenities" | "subways" | "active_rentals_count" | "open_rentals_count">,
  activeListings: Array<Pick<Listing, "months_free" | "no_fee" | "first_seen_at">> = [],
): BuildingLabel[] {
  const out: BuildingLabel[] = [];

  // 🆕 NEW — recently built or our explicit "new_*" tag
  const isNew = (building.tag ?? "").startsWith("new_") ||
    (building.year_built != null && building.year_built >= 2024);
  if (isNew) {
    out.push({
      id: "new",
      short: "新楼",
      emoji: "🆕",
      tooltip: `${building.year_built ?? "近期"}年建成 — 新房源`,
      className: "bg-amber-100 text-amber-900 ring-amber-200",
    });
  }

  // 💰 PROMO — any active unit has months_free >= 1.5
  const maxFree = activeListings.reduce(
    (m, l) => Math.max(m, l.months_free ?? 0),
    0,
  );
  if (maxFree >= 1.5) {
    out.push({
      id: "promo",
      short: `${maxFree} 月免租`,
      emoji: "💰",
      tooltip: `最多可免 ${maxFree} 个月租金`,
      className: "bg-green-100 text-green-800 ring-green-200",
    });
  }

  // 🏷️ NO-FEE — any unit no_fee
  const anyNoFee = activeListings.some((l) => l.no_fee);
  if (anyNoFee) {
    out.push({
      id: "no_fee",
      short: "免中介费",
      emoji: "🏷️",
      tooltip: "至少有一套免中介费",
      className: "bg-blue-50 text-blue-800 ring-blue-200",
    });
  }

  // 🏊 LUX — pool amenity
  const ams = new Set(building.amenities ?? []);
  if (ams.has("pool")) {
    out.push({
      id: "pool",
      short: "泳池",
      emoji: "🏊",
      tooltip: "楼内有泳池",
      className: "bg-cyan-50 text-cyan-800 ring-cyan-200",
    });
  }

  // 🐕 PET — dogs allowed
  if (ams.has("dogs")) {
    out.push({
      id: "pet",
      short: "可养宠",
      emoji: "🐕",
      tooltip: "允许养狗",
      className: "bg-orange-50 text-orange-800 ring-orange-200",
    });
  }

  // 🚇 SUBWAY — closest station < 0.15 mi (≈ 1 block)
  const subways = (building.subways ?? []) as Array<{ distance?: number }>;
  const nearest = subways.length
    ? Math.min(...subways.map((s) => Number(s.distance ?? 99)))
    : Infinity;
  if (nearest < 0.15) {
    out.push({
      id: "subway",
      short: "近地铁",
      emoji: "🚇",
      tooltip: `距离地铁站不到 ${nearest.toFixed(2)} 英里`,
      className: "bg-violet-50 text-violet-800 ring-violet-200",
    });
  }

  // 🔥 FRESH — any unit first-seen in past 7 days (sign of churn = available right now)
  const sevenDaysAgo = Date.now() - 7 * 86400_000;
  const freshCount = activeListings.filter(
    (l) => l.first_seen_at && new Date(l.first_seen_at).getTime() >= sevenDaysAgo,
  ).length;
  if (freshCount >= 2) {
    out.push({
      id: "fresh",
      short: `近 7 天新增 ${freshCount}`,
      emoji: "🔥",
      tooltip: `近 7 天新上 ${freshCount} 套`,
      className: "bg-rose-50 text-rose-800 ring-rose-200",
    });
  }

  return out;
}

// --------------------------------------------------------------------- //
//                       Median price by bed count                       //
// --------------------------------------------------------------------- //
export function medianPriceByBeds(
  listings: Array<Pick<Listing, "bedrooms" | "price_monthly" | "is_active">>,
): Record<string, number> {
  const buckets: Record<string, number[]> = {};
  for (const l of listings) {
    if (!l.is_active || l.bedrooms == null || l.price_monthly == null) continue;
    const k = String(l.bedrooms);
    (buckets[k] = buckets[k] ?? []).push(l.price_monthly);
  }
  const out: Record<string, number> = {};
  for (const [k, arr] of Object.entries(buckets)) {
    arr.sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    out[k] = arr.length % 2 === 0 ? Math.round((arr[mid - 1] + arr[mid]) / 2) : arr[mid];
  }
  return out;
}

// --------------------------------------------------------------------- //
//                           Helpers                                     //
// --------------------------------------------------------------------- //
export function formatBedsKey(n: number): string {
  if (n === 0) return "Studio";
  return `${n}BR`;
}
