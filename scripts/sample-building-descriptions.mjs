#!/usr/bin/env node
/**
 * Print a few sample building descriptions so we can design a parser for
 * "Indoor Amenity Highlights" / "Outdoor Amenity Highlights" sections.
 *
 * Usage: node --env-file=.env.local scripts/sample-building-descriptions.mjs
 */

import { createClient } from "@supabase/supabase-js";

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const targets = ["The Orchard", "Skyline Tower", "Gotham Point", "Lumen LIC", "The Italic"];
for (const name of targets) {
  const { data } = await supa
    .from("apt_buildings")
    .select("name, description")
    .ilike("name", `%${name}%`)
    .limit(1)
    .maybeSingle();
  console.log(`\n========== ${data?.name ?? name} ==========`);
  console.log(data?.description ?? "(no description)");
}
