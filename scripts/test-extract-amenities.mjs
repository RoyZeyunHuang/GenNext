#!/usr/bin/env node
/**
 * Verify extractDescriptionAmenities pulls the right bullets out of real
 * descriptions in the DB.
 *
 * Usage: node --env-file=.env.local scripts/test-extract-amenities.mjs
 */

import { createClient } from "@supabase/supabase-js";

// Inline a copy of the extractor — easier than wiring up tsx for a one-shot
// script. Keep in sync with src/lib/apartments/extract.ts.
const STANDARD_KEYWORDS = [
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

function extractDescriptionAmenities(description, standardAmenities = [], maxItems = 12) {
  if (!description) return [];
  const standardSet = new Set((standardAmenities ?? []).map((s) => s.toLowerCase()));
  const lines = description.split(/\r?\n/);
  const items = [];
  const seen = new Set();
  for (const raw of lines) {
    const m = raw.match(BULLET_RE);
    if (!m) continue;
    let item = m[1].trim();
    item = item.replace(/\s*\*+$/, "").trim();
    item = item.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (!item || item.length < 3 || item.length > 70) continue;
    if (!/[a-z]/i.test(item)) continue;
    const key = item.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) continue;
    let isStandard = false;
    for (const { kw, standard } of STANDARD_KEYWORDS) {
      if (standardSet.has(standard) && kw.test(item)) { isStandard = true; break; }
    }
    if (isStandard) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= maxItems) break;
  }
  return items;
}

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: bldgs } = await supa
  .from("apt_buildings")
  .select("name, description, amenities")
  .eq("is_tracked", true)
  .not("description", "is", null);

let total = 0;
for (const b of bldgs ?? []) {
  const items = extractDescriptionAmenities(b.description, b.amenities);
  if (items.length === 0) continue;
  total++;
  console.log(`\n[${b.name}]  +${items.length} bullets:`);
  for (const it of items) console.log(`   • ${it}`);
}
console.log(`\n[summary] ${total}/${(bldgs ?? []).length} buildings produced extra bullets`);
