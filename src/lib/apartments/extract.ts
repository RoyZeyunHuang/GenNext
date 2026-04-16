/**
 * Pull "extra" amenity bullets from a building's free-text description.
 *
 * StreetEasy's standard amenity list misses unique features like
 * "Karaoke Lounge", "Sim Lounge with Multisport Simulator", "Music Studio",
 * etc. — the developer description often lists them as bulleted highlights:
 *
 *   Indoor Amenity Highlights:
 *   •  Lobby Gallery Lounge
 *   •  Karaoke Lounge
 *   ...
 *
 * Bullet conventions vary by listing — `•`, `-`, `*` with either tab or
 * spaces. We grab anything matching that shape, dedupe, and filter out items
 * that clearly map to the standard amenities the UI already shows.
 */

import { AMENITY_LABELS } from "./constants";

/** Things that are already represented by the standard amenity tags. */
const STANDARD_KEYWORDS: Array<{ kw: RegExp; standard: string }> = [
  { kw: /\bdoorman\b/i, standard: "doorman" },
  { kw: /\bconcierge\b/i, standard: "concierge" },
  { kw: /\bgym|fitness center\b/i, standard: "gym" },
  { kw: /\b(swimming\s+)?pool\b/i, standard: "pool" },
  { kw: /\bhot\s*tub\b/i, standard: "hot_tub" },
  { kw: /\b(roof\s*deck|rooftop)\b/i, standard: "roofdeck" },
  { kw: /\bbike (room|storage)\b/i, standard: "bike_room" },
  { kw: /\bpackage room\b/i, standard: "package_room" },
  { kw: /\b(parking|garage)\b/i, standard: "parking" },
  { kw: /\bvalet parking\b/i, standard: "valet_parking" },
  { kw: /\b(elevator|lift)\b/i, standard: "elevator" },
  { kw: /\blaundry\b/i, standard: "laundry" },
  { kw: /\b(media room|cinema)\b/i, standard: "media_room" },
  { kw: /\bchildren'?s? playroom\b/i, standard: "childrens_playroom" },
  { kw: /\b(garden|courtyard)\b/i, standard: "garden" },
  { kw: /\bsmoke[-\s]?free\b/i, standard: "smoke_free" },
  { kw: /\bguarantors?\b/i, standard: "guarantors" },
  { kw: /\b(dogs?|pet[-\s]?friendly)\b/i, standard: "dogs" },
  { kw: /\bcats?\b/i, standard: "cats" },
];

const BULLET_RE = /^\s*[•\-\*●▪►]+[\s\t]+(.+?)\s*$/;

/**
 * Extract bulleted amenity items from a building description.
 *
 * @param description Raw description text (may be null).
 * @param standardAmenities Slugs of amenities already present on the building
 *   so we can hide bullets that duplicate them.
 * @param maxItems Cap on returned items.
 */
export function extractDescriptionAmenities(
  description: string | null | undefined,
  standardAmenities: string[] | null | undefined = [],
  maxItems = 12,
): string[] {
  if (!description) return [];
  const standardSet = new Set((standardAmenities ?? []).map((s) => s.toLowerCase()));
  const lines = description.split(/\r?\n/);
  const items: string[] = [];
  const seen = new Set<string>();

  for (const raw of lines) {
    const m = raw.match(BULLET_RE);
    if (!m) continue;
    let item = m[1].trim();

    // Strip trailing parenthetical notes, asterisks, footnote markers
    item = item.replace(/\s*\*+$/, "").trim();
    item = item.replace(/\s*\([^)]*\)\s*$/, "").trim();

    // Reject very long items (likely sentence fragments) or nonsense
    if (!item || item.length < 3 || item.length > 70) continue;
    // Reject items that are mostly punctuation/numbers
    if (!/[a-z]/i.test(item)) continue;

    const key = normalize(item);
    if (seen.has(key)) continue;

    // Drop bullets that just restate a standard amenity slot
    if (matchesStandard(item, standardSet)) continue;

    seen.add(key);
    items.push(item);
    if (items.length >= maxItems) break;
  }
  return items;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesStandard(item: string, standardSet: Set<string>): boolean {
  for (const { kw, standard } of STANDARD_KEYWORDS) {
    if (standardSet.has(standard) && kw.test(item)) return true;
  }
  return false;
}

/** Suggest a reasonable category bucket for an extracted bullet. */
export function bulletEmoji(item: string): string {
  const t = item.toLowerCase();
  if (/karaoke|music|piano|stage/.test(t)) return "🎤";
  if (/cinema|media|screening|theatre|theater/.test(t)) return "🎬";
  if (/game|gaming|billiard|pool table|arcade|chess/.test(t)) return "🎮";
  if (/golf|simulator|sport|basketball|tennis|squash|pickleball/.test(t)) return "🏌";
  if (/yoga|spa|sauna|steam|massage|wellness/.test(t)) return "🧘";
  if (/coworking|co-working|conference|business|library|study|quiet/.test(t)) return "💼";
  if (/dining|kitchen|bbq|grill|bar|cafe/.test(t)) return "🍽";
  if (/lounge|terrace|deck|garden|outdoor/.test(t)) return "🛋";
  if (/pet|dog|cat/.test(t)) return "🐾";
  if (/parking|garage|valet|bike/.test(t)) return "🚗";
  if (/laundry|package|storage|maker/.test(t)) return "📦";
  if (/play|kids|children/.test(t)) return "🧸";
  return "✨";
}

// Re-export to keep the AMENITY_LABELS import used (for future expansion).
export const _AMENITY_LABELS = AMENITY_LABELS;
