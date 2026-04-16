/**
 * Per-building rollups used by the redesigned apartments preview page.
 * Computes price range, concession, no-fee, freshness — purely from the
 * active-listing slice we already loaded.
 */

import type { Listing } from "./types";

export interface BuildingStats {
  count: number;
  minPrice: number | null;
  maxPrice: number | null;
  /** Sorted unique bed counts that have inventory, e.g. [0, 1, 2, 3] */
  bedMix: number[];
  /** Best concession across all active listings (months free). 0 = none. */
  maxFreeMonths: number;
  /** True if any active listing is no-fee. */
  anyNoFee: boolean;
  /** Listings first seen in last 7 days — surfaces "buzzing" buildings. */
  freshCount: number;
  /** Cheapest effective rent (after concession amortization), or null. */
  minEffective: number | null;
}

export function computeBuildingStats(
  listings: Array<Pick<Listing,
    | "price_monthly" | "bedrooms" | "months_free"
    | "lease_term_months" | "no_fee" | "first_seen_at"
  >>,
): BuildingStats {
  const bedSet = new Set<number>();
  let minPrice: number | null = null;
  let maxPrice: number | null = null;
  let maxFreeMonths = 0;
  let anyNoFee = false;
  let freshCount = 0;
  let minEffective: number | null = null;

  const sevenDaysAgo = Date.now() - 7 * 86400_000;

  for (const l of listings) {
    if (l.bedrooms != null) bedSet.add(l.bedrooms);
    if (l.price_monthly != null) {
      if (minPrice == null || l.price_monthly < minPrice) minPrice = l.price_monthly;
      if (maxPrice == null || l.price_monthly > maxPrice) maxPrice = l.price_monthly;
    }
    if (l.months_free != null && l.months_free > maxFreeMonths) {
      maxFreeMonths = l.months_free;
    }
    if (l.no_fee) anyNoFee = true;
    if (l.first_seen_at && new Date(l.first_seen_at).getTime() >= sevenDaysAgo) {
      freshCount++;
    }
    // Effective rent
    if (l.price_monthly != null) {
      const term = l.lease_term_months ?? 12;
      const free = l.months_free ?? 0;
      const eff = term > 0 && free > 0
        ? Math.round((l.price_monthly * (term - free)) / term)
        : l.price_monthly;
      if (minEffective == null || eff < minEffective) minEffective = eff;
    }
  }

  return {
    count: listings.length,
    minPrice,
    maxPrice,
    bedMix: Array.from(bedSet).sort((a, b) => a - b),
    maxFreeMonths,
    anyNoFee,
    freshCount,
    minEffective,
  };
}

/** Pretty-print a bed count: 0 = 开间, n = n卧 */
export function bedShort(n: number): string {
  return n === 0 ? "开间" : `${n}卧`;
}

/** Render the bedMix as a single line: "开间·1卧·2卧·3卧" */
export function bedMixLabel(beds: number[]): string {
  if (beds.length === 0) return "";
  return beds.map(bedShort).join(" · ");
}

/** Compact price-range label: "$3,675 - $8,500" or single price if equal. */
export function priceRangeLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  if (min == null || max == null) return `$${(min ?? max)!.toLocaleString()}`;
  if (min === max) return `$${min.toLocaleString()}`;
  return `$${min.toLocaleString()} – $${max.toLocaleString()}`;
}

// --------------------------------------------------------------------- //
//                        Client-brief matching                          //
// --------------------------------------------------------------------- //

/** Subset of Listing fields needed for matching — keeps the call site
 *  honest about what data flows in. */
export interface MatchListing {
  price_monthly: number | null;
  bedrooms: number | null;
  available_at: string | null;
  months_free: number | null;
  lease_term_months: number | null;
  no_fee: boolean;
}

export interface ClientBrief {
  /** Campus shortName from NYC_CAMPUSES (e.g. "NYU WSQ") */
  school: string | null;
  /** Max monthly rent in dollars (after concession) */
  budgetMax: number | null;
  /** Bed count: 0 = studio, 1, 2, 3, 4. null = any */
  beds: number | null;
  /** ISO date "YYYY-MM-DD" — agent wants units available BY this date */
  moveInBy: string | null;
}

/** True if any of the brief fields is set. */
export function briefIsActive(brief: ClientBrief): boolean {
  return brief.school != null || brief.budgetMax != null
    || brief.beds != null || brief.moveInBy != null;
}

export interface MatchReason {
  ok: boolean;
  /** Short Chinese label for the criterion ("预算" / "户型" / "入住" / "通勤") */
  label: string;
  /** Detail line ("$3,800 净租 ≤ $4,000 预算" etc.) */
  detail: string;
}

export interface MatchResult {
  /** 0..4 number of matched criteria (ignores criteria not in brief) */
  score: number;
  /** Out of N total criteria the brief specified */
  total: number;
  reasons: MatchReason[];
  /** Cheapest unit matching brief beds (or any beds), null if none */
  bestPrice: number | null;
  bestPriceBeds: number | null;
  /** Commute minutes to brief school, null if no commute data */
  commuteMinutes: number | null;
  commuteLines: string[];
}

/** Compute effective rent for one listing (concession-amortized). */
function effectiveRentOf(l: MatchListing): number | null {
  if (l.price_monthly == null) return null;
  const term = l.lease_term_months ?? 12;
  const free = l.months_free ?? 0;
  if (term > 0 && free > 0) {
    return Math.round((l.price_monthly * (term - free)) / term);
  }
  return l.price_monthly;
}

/** Single-letter gate for whether a listing satisfies the bed criterion. */
function bedsOk(l: MatchListing, beds: number | null): boolean {
  if (beds == null) return true;
  return l.bedrooms === beds;
}

/**
 * Score a building against an agent's client brief.
 *
 * Each criterion in the brief is one possible match point. We never penalize
 * a building for criteria the agent didn't specify — score / total is a
 * fraction "how many of the brief's asks did this building satisfy".
 */
export function computeMatch(
  listings: MatchListing[],
  brief: ClientBrief,
  commute: { minutes: number | null; lines: string[] } | null,
): MatchResult {
  const reasons: MatchReason[] = [];
  let score = 0;
  let total = 0;

  // Always compute "best price for the requested beds" — useful even if
  // the agent didn't set a budget cap.
  const matchingBeds = listings.filter((l) => bedsOk(l, brief.beds));
  const cheapestEff = matchingBeds.reduce<{ eff: number | null; beds: number | null }>(
    (acc, l) => {
      const e = effectiveRentOf(l);
      if (e == null) return acc;
      if (acc.eff == null || e < acc.eff) return { eff: e, beds: l.bedrooms };
      return acc;
    },
    { eff: null, beds: null },
  );

  // 1. Budget
  if (brief.budgetMax != null) {
    total++;
    const inBudget = cheapestEff.eff != null && cheapestEff.eff <= brief.budgetMax;
    if (inBudget) {
      score++;
      reasons.push({
        ok: true,
        label: "预算",
        detail: `净 $${cheapestEff.eff!.toLocaleString()} ≤ $${brief.budgetMax.toLocaleString()}`,
      });
    } else if (cheapestEff.eff != null) {
      reasons.push({
        ok: false,
        label: "预算",
        detail: `最低 $${cheapestEff.eff!.toLocaleString()} > $${brief.budgetMax.toLocaleString()}`,
      });
    } else {
      reasons.push({ ok: false, label: "预算", detail: "无在租房源" });
    }
  }

  // 2. Beds
  if (brief.beds != null) {
    total++;
    const has = matchingBeds.length > 0;
    if (has) {
      score++;
      reasons.push({
        ok: true,
        label: "户型",
        detail: `${matchingBeds.length} 套 ${bedShort(brief.beds)} 在租`,
      });
    } else {
      reasons.push({
        ok: false,
        label: "户型",
        detail: `无 ${bedShort(brief.beds)} 在租`,
      });
    }
  }

  // 3. Move-in
  if (brief.moveInBy) {
    total++;
    const target = brief.moveInBy;
    const ready = matchingBeds.some(
      (l) => l.available_at != null && l.available_at <= target,
    );
    if (ready) {
      score++;
      reasons.push({ ok: true, label: "入住", detail: `${target} 前可入住` });
    } else {
      const earliest = matchingBeds
        .map((l) => l.available_at)
        .filter((d): d is string => !!d)
        .sort()[0];
      reasons.push({
        ok: false,
        label: "入住",
        detail: earliest ? `最早 ${earliest}` : "无明确日期",
      });
    }
  }

  // 4. Commute (only if brief.school + commute data both present)
  if (brief.school) {
    total++;
    if (commute?.minutes != null) {
      const fast = commute.minutes <= 30;
      if (fast) {
        score++;
        reasons.push({
          ok: true,
          label: "通勤",
          detail: `${commute.minutes} 分钟到 ${brief.school}`,
        });
      } else {
        reasons.push({
          ok: false,
          label: "通勤",
          detail: `${commute.minutes} 分钟到 ${brief.school} (>30)`,
        });
      }
    } else {
      reasons.push({ ok: false, label: "通勤", detail: "无数据" });
    }
  }

  return {
    score, total, reasons,
    bestPrice: cheapestEff.eff,
    bestPriceBeds: cheapestEff.beds,
    commuteMinutes: commute?.minutes ?? null,
    commuteLines: commute?.lines ?? [],
  };
}
