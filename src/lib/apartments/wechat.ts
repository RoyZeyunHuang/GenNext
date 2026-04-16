/**
 * WeChat-ready Chinese-formatted snippets for buildings and units.
 * Output is plain text with emoji + line breaks — paste-and-send.
 */

import type { Building, Listing } from "./types";
import type { CommuteResult } from "./commute";
import { effectiveRent } from "./compute";
import { AMENITY_LABELS, areaShortLabel } from "./constants";

// --------------------------------------------------------------------- //
//                              Helpers                                  //
// --------------------------------------------------------------------- //
function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "?";
  return `$${n.toLocaleString()}`;
}

function fmtBeds(n: number | null | undefined): string {
  if (n == null) return "?";
  if (n === 0) return "Studio";
  if (n === Math.floor(n)) return `${n}BR`;
  return `${n}BR`;
}

function fmtBaths(n: number | null | undefined): string {
  if (n == null) return "";
  if (n === Math.floor(n)) return `${n}BA`;
  return `${n}BA`;
}

function priceRange(listings: Array<Pick<Listing, "price_monthly" | "is_active">>): string {
  const prices = listings
    .filter((l) => l.is_active && l.price_monthly != null)
    .map((l) => l.price_monthly!)
    .sort((a, b) => a - b);
  if (prices.length === 0) return "暂无在租";
  if (prices.length === 1) return fmtMoney(prices[0]);
  return `${fmtMoney(prices[0])}-${fmtMoney(prices[prices.length - 1])}`;
}

/** Pick the two/three top amenities most students care about. */
function topAmenities(amenities: string[] | null | undefined): string[] {
  if (!amenities) return [];
  const priority = [
    "pool", "full_time_doorman", "doorman", "concierge",
    "gym", "roofdeck", "garden", "media_room",
    "package_room", "valet_parking", "garage",
  ];
  const have = new Set(amenities);
  const picked: string[] = [];
  for (const id of priority) {
    if (have.has(id) && picked.length < 4) {
      picked.push(AMENITY_LABELS[id] ?? id);
    }
  }
  return picked;
}

/** Format a transit line as "F线" / "1线" — Chinese convention. */
function fmtLine(line: string): string {
  return /^[A-Z]+$/.test(line) ? `${line}线` : line;
}

/** Pick the 2-3 most relevant campus commutes for the snippet. */
function topCommutes(commutes: CommuteResult[] | null | undefined): string[] {
  if (!commutes || commutes.length === 0) return [];
  // Prioritize the schools with the shortest transit time
  return commutes
    .slice()
    .sort((a, b) => (a.transit?.durationMinutes ?? 999) - (b.transit?.durationMinutes ?? 999))
    .slice(0, 3)
    .map((c) => {
      const min = c.transit?.durationMinutes;
      const lines = c.transit?.lines ?? [];
      const lineStr = lines.length ? `(${lines.map(fmtLine).join("→")})` : "";
      return min != null ? `${c.campusShortName} ${min}min${lineStr}` : c.campusShortName;
    });
}

// --------------------------------------------------------------------- //
//                       Building → WeChat snippet                       //
// --------------------------------------------------------------------- //
export function formatBuildingSnippet(opts: {
  building: Building;
  activeListings: Listing[];
  commutes?: CommuteResult[] | null;
}): string {
  const { building, activeListings, commutes } = opts;
  const lines: string[] = [];

  // Header — name + neighborhood
  const area = areaShortLabel(building.area);
  lines.push(`🏠 ${building.name} · ${building.address ?? ""} (${area})`);

  // Year + scale
  const meta: string[] = [];
  if (building.year_built) meta.push(`${building.year_built} 建`);
  if (building.floor_count) meta.push(`${building.floor_count}F`);
  if (building.unit_count) meta.push(`${building.unit_count} 套`);
  if (meta.length) lines.push(`📅 ${meta.join(" · ")}`);

  // Available + price
  const available = building.open_rentals_count ?? activeListings.length;
  if (available > 0) {
    lines.push(`💰 ${available} 套在租 · ${priceRange(activeListings)}`);
  } else {
    lines.push(`💰 暂无在租`);
  }

  // Commutes
  const commLines = topCommutes(commutes);
  if (commLines.length) lines.push(`🚇 ${commLines.join(" · ")}`);

  // Top amenities
  const ams = topAmenities(building.amenities);
  if (ams.length) lines.push(`✨ ${ams.join(" · ")}`);

  // Pet / smoke-free as policy hints
  const policies = (building.amenities ?? []).filter((a) =>
    ["dogs", "cats", "smoke_free", "guarantors"].includes(a),
  );
  if (policies.length) {
    lines.push(`🐾 ${policies.map((p) => AMENITY_LABELS[p] ?? p).join(" · ")}`);
  }

  // Link
  lines.push(`🔗 ${building.building_url}`);

  return lines.join("\n");
}

// --------------------------------------------------------------------- //
//                         Unit → WeChat snippet                         //
// --------------------------------------------------------------------- //
export function formatUnitSnippet(opts: {
  unit: Listing;
  building?: Building | null;
  commutes?: CommuteResult[] | null;
}): string {
  const { unit, building, commutes } = opts;
  const lines: string[] = [];

  // Header
  const buildingName = building?.name ?? "";
  const unitNo = unit.unit ?? unit.address ?? "";
  lines.push(`🏠 ${buildingName} #${unitNo} — ${fmtBeds(unit.bedrooms)} · ${fmtBaths(unit.bathrooms)}${unit.sqft ? ` · ${unit.sqft.toLocaleString()}ft²` : ""}`);

  // Price + concession + effective
  const eff = effectiveRent(unit.price_monthly, unit.months_free, unit.lease_term_months);
  const priceLine: string[] = [`💰 ${fmtMoney(unit.price_monthly)}/mo`];
  if (unit.months_free) priceLine.push(`${unit.months_free} 个月免租`);
  if (unit.lease_term_months) priceLine.push(`${unit.lease_term_months} 个月签约`);
  lines.push(priceLine.join(" · "));
  if (eff != null && eff !== unit.price_monthly) {
    lines.push(`   净租金 ${fmtMoney(eff)}/mo`);
  }

  // Move-in
  if (unit.available_at) {
    lines.push(`📅 入住: ${unit.available_at}`);
  }

  // Floor plan / no fee
  const extras: string[] = [];
  if (unit.no_fee) extras.push("免中介费");
  if (unit.furnished) extras.push("家具齐全");
  if (extras.length) lines.push(`🏷️ ${extras.join(" · ")}`);

  // Top commute (just one, the closest)
  if (commutes && commutes.length) {
    const top = topCommutes(commutes).slice(0, 1);
    if (top.length) lines.push(`🚇 ${top[0]}`);
  }

  // Link
  lines.push(`🔗 ${unit.url}`);
  return lines.join("\n");
}

// --------------------------------------------------------------------- //
//                  Compare snippet (multi-building)                     //
// --------------------------------------------------------------------- //
export function formatCompareSnippet(opts: {
  buildings: Building[];
  listingsByBuilding: Map<string, Listing[]>;
  commutesByBuilding?: Map<string, CommuteResult[]>;
  schoolShortName?: string;
}): string {
  const { buildings, listingsByBuilding, commutesByBuilding, schoolShortName } = opts;
  const lines: string[] = [];
  const schoolNote = schoolShortName ? `(以 ${schoolShortName} 通勤为参考)` : "";
  lines.push(`📊 ${buildings.length} 栋楼对比 ${schoolNote}`.trim());
  lines.push("");

  for (const b of buildings) {
    const listings = listingsByBuilding.get(b.id) ?? [];
    const commutes = commutesByBuilding?.get(b.id);
    const range = priceRange(listings);
    const targetCommute = schoolShortName
      ? commutes?.find((c) => c.campusShortName === schoolShortName)
      : null;
    const comm = targetCommute?.transit?.durationMinutes
      ? ` · ${targetCommute.transit.durationMinutes}min 到 ${schoolShortName}`
      : "";
    lines.push(`▸ ${b.name}`);
    lines.push(`  ${range} · ${b.year_built ?? "?"} 建${comm}`);
    lines.push(`  🔗 ${b.building_url}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
