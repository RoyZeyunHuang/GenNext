#!/usr/bin/env node
/**
 * Diagnose: print every tracked building's image_url + content-length so we can
 * spot placeholder images.
 *
 * Usage: node --env-file=.env.local scripts/diagnose-no-photo.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) { console.error("SUPABASE vars not set"); process.exit(1); }

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const { data: bldgs, error } = await supa
  .from("apt_buildings")
  .select("id, name, area, image_url, building_url, last_fetched_at")
  .eq("is_tracked", true)
  .order("area")
  .order("name");
if (error) { console.error(error); process.exit(1); }

console.log(`\n[diagnose] ${bldgs.length} tracked buildings\n`);

for (const b of bldgs) {
  let info = "";
  if (b.image_url) {
    try {
      const res = await fetch(b.image_url, { method: "HEAD", redirect: "follow" });
      const len = res.headers.get("content-length");
      const ct = res.headers.get("content-type");
      info = `${res.status} ${ct} ${len ? `${len}B` : "?"}`;
    } catch (e) {
      info = `ERR ${e.message}`;
    }
  } else {
    info = "NO_IMAGE_URL";
  }
  console.log(`[${b.area}] ${b.name}`);
  console.log(`     ${b.image_url ?? "(null)"}`);
  console.log(`     ${info}`);
}
