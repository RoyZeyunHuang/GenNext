#!/usr/bin/env node
/**
 * Find which building's description contains a given keyword.
 * Usage: node --env-file=.env.local scripts/find-amenity-keyword.mjs karaoke
 */

import { createClient } from "@supabase/supabase-js";

const kw = process.argv[2] ?? "karaoke";
const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data } = await supa
  .from("apt_buildings")
  .select("name, description")
  .ilike("description", `%${kw}%`);
console.log(`[search] ${kw}: ${data?.length ?? 0} matches\n`);
for (const b of data ?? []) {
  console.log(`========== ${b.name} ==========`);
  // Just print a 200-char window around the keyword
  const idx = b.description.toLowerCase().indexOf(kw.toLowerCase());
  if (idx >= 0) {
    const start = Math.max(0, idx - 100);
    const end = Math.min(b.description.length, idx + 200);
    console.log("..." + b.description.slice(start, end) + "...");
  }
  console.log();
}
