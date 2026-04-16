#!/usr/bin/env node
/**
 * Strip StreetEasy "no_photo_building" placeholder URLs from apt_buildings.
 * The UI now falls back to a listing photo when the building image is null.
 *
 * Usage: node --env-file=.env.local scripts/clean-placeholder-images.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) { console.error("SUPABASE vars not set"); process.exit(1); }
const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const { data: bldgs, error } = await supa
  .from("apt_buildings")
  .select("id, name, image_url")
  .like("image_url", "%no_photo_building%");
if (error) { console.error(error); process.exit(1); }

console.log(`[clean] ${bldgs.length} buildings with placeholder image_url`);
for (const b of bldgs) {
  console.log(`  → null'ing ${b.name} (${b.id})`);
  const { error: uErr } = await supa
    .from("apt_buildings")
    .update({ image_url: null })
    .eq("id", b.id);
  if (uErr) console.warn(`     err: ${uErr.message}`);
}

// Also clean any listings with the placeholder
const { data: lst } = await supa
  .from("apt_listings")
  .select("id, image_url")
  .like("image_url", "%no_photo%");
console.log(`[clean] ${(lst ?? []).length} listings with placeholder image_url`);
for (const l of lst ?? []) {
  await supa.from("apt_listings").update({ image_url: null }).eq("id", l.id);
}

console.log("✓ done");
