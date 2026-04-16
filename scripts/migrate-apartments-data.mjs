#!/usr/bin/env node
/**
 * One-time migration: pull apt_buildings + apt_listings data from the local
 * TheMoniter SQLite DB and push to Supabase.
 *
 * Usage:
 *   node --env-file=.env.local scripts/migrate-apartments-data.mjs \
 *        /Users/roycehuang/ClaudeApps/TheMoniter/data/listings.db
 *
 * Requires env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotent: safely re-runnable (upserts on id / listing_key).
 */

import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import process from "node:process";

const dbPath = process.argv[2];
if (!dbPath) {
  console.error("usage: node migrate-apartments-data.mjs /path/to/listings.db");
  process.exit(1);
}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error("env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const AREA_LOOKUP = new Map([
  // LIC / queens
  ["long island city", "lic"], ["hunters point", "lic"], ["hunter's point", "lic"],
  ["astoria", "lic"], ["rego park", "queens"], ["forest hills", "queens"],
  ["flushing", "queens"], ["elmhurst", "queens"], ["jamaica", "queens"],
  // manhattan
  ["inwood", "manhattan"], ["washington heights", "manhattan"],
  ["harlem", "manhattan"], ["east harlem", "manhattan"], ["morningside heights", "manhattan"],
  ["upper west side", "manhattan"], ["upper east side", "manhattan"],
  ["midtown", "manhattan"], ["midtown east", "manhattan"], ["midtown west", "manhattan"],
  ["midtown south", "manhattan"], ["hell's kitchen", "manhattan"], ["hells kitchen", "manhattan"],
  ["hudson yards", "manhattan"], ["chelsea", "manhattan"], ["west chelsea", "manhattan"],
  ["flatiron", "manhattan"], ["nomad", "manhattan"], ["gramercy", "manhattan"],
  ["kips bay", "manhattan"], ["murray hill", "manhattan"], ["turtle bay", "manhattan"],
  ["sutton place", "manhattan"], ["lenox hill", "manhattan"], ["yorkville", "manhattan"],
  ["lincoln square", "manhattan"], ["west village", "manhattan"], ["greenwich village", "manhattan"],
  ["east village", "manhattan"], ["lower east side", "manhattan"], ["two bridges", "manhattan"],
  ["soho", "manhattan"], ["tribeca", "manhattan"], ["financial district", "manhattan"],
  ["battery park city", "manhattan"], ["little italy", "manhattan"], ["chinatown", "manhattan"],
  ["roosevelt island", "manhattan"],
  // brooklyn
  ["williamsburg", "brooklyn"], ["greenpoint", "brooklyn"], ["bushwick", "brooklyn"],
  ["bedford-stuyvesant", "brooklyn"], ["bedford stuyvesant", "brooklyn"],
  ["crown heights", "brooklyn"], ["park slope", "brooklyn"], ["prospect heights", "brooklyn"],
  ["carroll gardens", "brooklyn"], ["cobble hill", "brooklyn"], ["dumbo", "brooklyn"],
  ["downtown brooklyn", "brooklyn"], ["brooklyn heights", "brooklyn"],
  ["coney island", "brooklyn"], ["flatbush", "brooklyn"], ["east flatbush", "brooklyn"],
  ["bensonhurst", "brooklyn"], ["bay ridge", "brooklyn"], ["sunset park", "brooklyn"],
  ["fort greene", "brooklyn"], ["clinton hill", "brooklyn"], ["weeksville", "brooklyn"],
  ["stuyvesant heights", "brooklyn"],
]);

function pickArea(neighborhood, borough) {
  const n = (neighborhood || "").toLowerCase().trim();
  if (AREA_LOOKUP.has(n)) return AREA_LOOKUP.get(n);
  const b = (borough || "").toLowerCase().trim();
  if (b === "manhattan") return "manhattan";
  if (b === "brooklyn") return "brooklyn";
  if (b === "queens") return "queens";
  return "lic";
}

function isoOrNull(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function asInt(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}
function asNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------- Open SQLite ----------
const db = new Database(path.resolve(dbPath), { readonly: true });

// ---------- Buildings ----------
const bldgRows = db.prepare(`
  SELECT * FROM buildings
`).all();
console.log(`[buildings] ${bldgRows.length} rows in SQLite`);

const bldgUpsertPayload = bldgRows.map((r) => ({
  id: r.building_url,                        // URL as stable id (migration will reconcile on first Apify run)
  name: r.building_title || "?",
  address: r.address,
  neighborhood: r.neighborhood,
  borough: r.borough,
  area: pickArea(r.neighborhood, r.borough),
  tag: null,
  building_url: r.building_url,
  building_slug: null,
  year_built: r.year_built,
  floor_count: r.floor_count,
  unit_count: r.unit_count,
  active_rentals_count: r.active_rentals_count,
  open_rentals_count: r.open_rentals_count,
  is_new_development: !!r.is_new_development,
  image_url: r.building_image,
  is_tracked: true,
  last_fetched_at: isoOrNull(r.last_fetched_at),
  updated_at: new Date().toISOString(),
}));
if (bldgUpsertPayload.length > 0) {
  const { error } = await supa.from("apt_buildings").upsert(bldgUpsertPayload, { onConflict: "id" });
  if (error) {
    console.error("apt_buildings upsert failed:", error);
    process.exit(1);
  }
}
console.log(`[buildings] ${bldgUpsertPayload.length} rows upserted`);

// ---------- Listings ----------
const urlToBuildingId = new Map(bldgUpsertPayload.map((b) => [b.building_url, b.id]));

const lstRows = db.prepare(`
  SELECT * FROM listings
  WHERE is_active = 1
`).all();
console.log(`[listings] ${lstRows.length} active rows in SQLite`);

function buildingIdForListingUrl(url) {
  if (!url) return null;
  // Listing URL is /building/{slug}/{unit}?...
  // Building URL is /building/{slug}. Compare by prefix.
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === "building") {
      const buildingPath = `/building/${parts[1]}`;
      const fullBuildingUrl = `${u.origin}${buildingPath}`;
      return urlToBuildingId.get(fullBuildingUrl) ?? null;
    }
  } catch {}
  return null;
}

const lstUpsertPayload = lstRows
  .map((r) => {
    const lid = r.apify_listing_id || r.listing_key;        // stable id
    if (!lid) return null;
    return {
      id: String(lid),
      building_id: buildingIdForListingUrl(r.url),
      url: r.url,
      unit: r.unit ?? null,
      address: r.address,
      neighborhood: r.neighborhood,
      borough: r.borough,
      price_monthly: asInt(r.price_monthly),      // integer column
      bedrooms: asNum(r.bedrooms),                // real column
      bathrooms: asNum(r.bathrooms),              // real column
      sqft: asNum(r.sqft),                        // numeric — StreetEasy sometimes returns decimals
      no_fee: !!r.no_fee,
      is_featured: !!r.is_featured,
      furnished: !!r.furnished,
      available_at: r.available_at,
      months_free: asNum(r.months_free),          // numeric(4,1) — 0.5-month offers exist
      lease_term_months: asNum(r.lease_term_months), // numeric(5,1) — 12.5 exists
      image_url: r.image_url,
      floor_plan_url: null,
      listing_type: r.listing_type ?? "rental",
      first_seen_at: isoOrNull(r.first_seen_at) ?? new Date().toISOString(),
      last_seen_at: isoOrNull(r.last_seen_at) ?? new Date().toISOString(),
      is_active: true,
      source: "migration",
    };
  })
  .filter(Boolean);

// Push in chunks so we don't exceed the 1 MB request limit.
const CHUNK = 500;
let total = 0;
for (let i = 0; i < lstUpsertPayload.length; i += CHUNK) {
  const batch = lstUpsertPayload.slice(i, i + CHUNK);
  const { error } = await supa.from("apt_listings").upsert(batch, { onConflict: "id" });
  if (error) {
    console.error("apt_listings upsert failed:", error);
    process.exit(1);
  }
  total += batch.length;
  console.log(`[listings] chunk ${i / CHUNK + 1}: upserted ${total}/${lstUpsertPayload.length}`);
}
console.log(`[listings] total upserted: ${total}`);

// ---------- Record a fake run log ----------
await supa.from("apt_refresh_runs").insert({
  status: "ok",
  buildings_requested: bldgUpsertPayload.length,
  buildings_fetched: bldgUpsertPayload.length,
  listings_upserted: total,
  listings_new: total,
  listings_inactivated: 0,
  cost_cents_estimate: 0,
  triggered_by: "migration",
  finished_at: new Date().toISOString(),
});

console.log("\n✓ migration done");
db.close();
