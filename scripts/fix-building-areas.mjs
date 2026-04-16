#!/usr/bin/env node
/**
 * Authoritative area backfill: match each tracked building to a HOT_BUILDINGS
 * seed by NAME and copy seed.area onto the DB row. Seed catalog is the source
 * of truth.
 *
 * Usage: node --env-file=.env.local scripts/fix-building-areas.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) { console.error("SUPABASE vars not set"); process.exit(1); }
const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// Mirror of HOT_BUILDINGS in src/lib/apartments/hot_buildings.ts (name + area only).
// Update this if the seed catalog changes.
const SEED_AREA_BY_NAME = {
  // LIC (24)
  "The Orchard":               "lic",
  "Jasper":                    "lic",
  "The Italic":                "lic",
  "The Bold":                  "lic",
  "Lumen LIC":                 "lic",
  "2-21 Malt Drive":           "lic",
  "2-21 Malt Dr":              "lic",
  "Gotham Point":              "lic",
  "Bevel LIC":                 "lic",
  "Skyline Tower":             "lic",
  "Jackson Park":              "lic",
  "Sven":                      "lic",
  "ARC":                       "lic",
  "Eagle Lofts":               "lic",
  "Tower 28":                  "lic",
  "Watermark LIC":             "lic",
  "GALERIE":                   "lic",
  "5Pointz LIC":               "lic",
  "Heritage 27 on 27th":       "lic",
  "AltaLIC":                   "lic",
  "HERO":                      "lic",
  "The Forge":                 "lic",
  "Dutch LIC":                 "lic",
  "4610 Center Blvd":          "lic",
  "28-10 Jackson Avenue":      "lic",
  "28-40 Jackson Avenue":      "lic",
  "42-62 Hunter Street":       "lic",
  "43 Cottage Street":         "jersey_city", // duplicate name in JC list
  // Queens (1)
  "Vista65":                   "queens",
  // Manhattan (10)
  "1440 Amsterdam Avenue":     "manhattan",
  "1440 Amsterdam":            "manhattan",
  "Lyra":                      "manhattan",
  "Manhattan Park":            "manhattan", // 注意:Brooklyn 也有同名,按 URL 区分
  "MIMA":                      "manhattan",
  "MiMA":                      "manhattan",
  "Miramar":                   "manhattan",
  "Miramar at 407 West 206th Street": "manhattan",
  "The Octagon":               "manhattan",
  "The Ritz Plaza":            "manhattan",
  "Stuyvesant Town":           "manhattan",
  "448 East 107th Street":     "manhattan",
  // Brooklyn (1)
  "The Highland":              "brooklyn",
  // Jersey City (4) - 43 Cottage Street already listed above
  "Journal Squared":           "jersey_city",
  "555 Summit Avenue":         "jersey_city",
  "351 Marin Boulevard":       "jersey_city",
};

function normalizeName(s) {
  return (s ?? "").trim();
}

const { data: bldgs } = await supa
  .from("apt_buildings")
  .select("id, name, area, building_url")
  .eq("is_tracked", true)
  .order("name");

let fixed = 0;
let unmatched = 0;
for (const b of bldgs ?? []) {
  const name = normalizeName(b.name);
  let target = SEED_AREA_BY_NAME[name];
  // Special case: "Manhattan Park" appears in both Brooklyn and Manhattan — use URL hint
  if (name === "Manhattan Park" && (b.building_url ?? "").toLowerCase().includes("brooklyn")) {
    target = "brooklyn";
  }
  if (!target) {
    unmatched++;
    console.log(`  ? NO SEED: "${b.name}"  area=${b.area}`);
    continue;
  }
  if (b.area !== target) {
    console.log(`  ✓ FIX: ${b.name}  ${b.area} → ${target}`);
    const { error } = await supa.from("apt_buildings").update({ area: target }).eq("id", b.id);
    if (error) console.warn(`     err: ${error.message}`);
    else fixed++;
  }
}
console.log(`\n[done] fixed=${fixed}  unmatched=${unmatched}  total=${(bldgs ?? []).length}`);
