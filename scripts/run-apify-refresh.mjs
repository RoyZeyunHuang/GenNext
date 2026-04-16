#!/usr/bin/env node
/**
 * Manual Apify refresh — runs outside Next.js so no timeout limit.
 *
 * Usage: node --env-file=.env.local scripts/run-apify-refresh.mjs
 *
 * Calls the same Apify PPR actor, parses results, writes to Supabase.
 * ~3-5 minutes for 40 buildings. Cost: ~$0.14.
 */

import { createClient } from "@supabase/supabase-js";

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_ACTOR = process.env.APIFY_ACTOR || "memo23/streeteasy-ppr";
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!APIFY_TOKEN) { console.error("APIFY_API_TOKEN not set"); process.exit(1); }
if (!SUPA_URL || !SUPA_KEY) { console.error("SUPABASE vars not set"); process.exit(1); }

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const BASE = "https://api.apify.com/v2";

// ---------- Get tracked building URLs ----------
const { data: buildings } = await supa
  .from("apt_buildings")
  .select("id, building_url, building_slug, area, tag, note")
  .eq("is_tracked", true);

const urls = (buildings ?? [])
  .map(b => b.building_url)
  .filter(u => u && u.includes("streeteasy.com/building/"));

console.log(`\n[refresh] ${urls.length} tracked building URLs`);

// ---------- Start Apify run ----------
const actorPath = APIFY_ACTOR.replace("/", "~");
const startRes = await fetch(`${BASE}/acts/${actorPath}/runs?token=${APIFY_TOKEN}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startUrls: urls.map(u => ({ url: u })) }),
});
if (!startRes.ok) { console.error("start failed:", await startRes.text()); process.exit(1); }
const runId = (await startRes.json()).data?.id;
console.log(`[refresh] actor run started: ${runId}`);

// ---------- Poll until done ----------
let status = "RUNNING";
while (status === "RUNNING" || status === "READY") {
  await new Promise(r => setTimeout(r, 5000));
  const pollRes = await fetch(`${BASE}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
  const pollData = (await pollRes.json()).data;
  status = pollData?.status ?? "UNKNOWN";
  process.stdout.write(`  status=${status} ...`);
  if (status === "SUCCEEDED") {
    const datasetId = pollData.defaultDatasetId;
    console.log(` dataset=${datasetId}`);

    // ---------- Fetch dataset ----------
    const dsRes = await fetch(`${BASE}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true&format=json`);
    const items = await dsRes.json();
    console.log(`[refresh] got ${items.length} building items`);

    // ---------- Parse + upsert ----------
    let totalListings = 0;
    let newListings = 0;

    for (const item of items) {
      const buildingId = String(item.building_id ?? item.basicInfo_id ?? "");
      if (!buildingId) continue;

      const buildingUrl = String(item.building_url ?? item.originalAddress ?? "");
      const seedMatch = (buildings ?? []).find(b => b.building_url === buildingUrl);

      // Parse subway data
      let subways = [];
      try { subways = JSON.parse(item.building_nearby_subways_json ?? "[]"); } catch {}
      let schools = [];
      try { schools = JSON.parse(item.building_nearby_schools_json ?? "[]"); } catch {}
      let amenities = [];
      try { amenities = JSON.parse(item.building_amenities_json ?? "[]").map(a => a.id).filter(Boolean); } catch {}

      // Upsert building
      const bldgRow = {
        id: buildingId,
        name: item.building_title ?? item.building_subtitle ?? "?",
        address: item.building_subtitle ?? null,
        neighborhood: item.building_area_name ?? null,
        borough: item.building_area_borough_name ?? null,
        area: seedMatch?.area ?? "lic",
        tag: seedMatch?.tag ?? null,
        building_url: buildingUrl,
        building_slug: seedMatch?.building_slug ?? null,
        official_url: item.building_building_showcase_website ?? null,
        leasing_phone: item.building_building_showcase_phone ?? null,
        leasing_company: item.building_building_showcase_company_name ?? null,
        year_built: item.building_year_built ?? null,
        floor_count: item.building_floor_count ?? null,
        unit_count: item.building_residential_unit_count ?? null,
        active_rentals_count: item.building_active_rentals_count ?? null,
        open_rentals_count: item.building_open_rentals_count ?? null,
        closed_rentals_count: item.building_closed_rentals_count ?? null,
        is_new_development: !!item.building_is_new_development,
        image_url: item.building_medium_image_uri ?? null,
        amenities: amenities,
        subways: subways,
        schools: schools,
        description: item.buildingById_description ?? null,
        latitude: item.building_address_latitude ? Number(item.building_address_latitude) : null,
        longitude: item.building_address_longitude ? Number(item.building_address_longitude) : null,
        note: seedMatch?.note ?? null,
        is_tracked: true,
        last_fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Delete old seed row if id changed
      if (seedMatch) {
        const oldId = seedMatch.id;
        if (oldId !== buildingId && oldId.startsWith("http")) {
          await supa.from("apt_buildings").delete().eq("id", oldId);
        }
      }

      const { error: bErr } = await supa.from("apt_buildings").upsert(bldgRow, { onConflict: "id" });
      if (bErr) console.warn(`  bldg upsert err: ${bErr.message}`);

      // Parse listings
      let digests = [];
      try {
        const raw = item.buildingById_rentalInventorySummary_availableListingDigests_json;
        digests = typeof raw === "string" ? JSON.parse(raw) : (raw ?? []);
      } catch {}

      const listingRows = digests.filter(d => d?.id).map(d => {
        const unit = String(d.unit ?? "");
        const addr = bldgRow.address && unit ? `${bldgRow.address} #${unit}` : bldgRow.address;
        const photoKey = d.leadMedia?.photo?.key;
        const fpKey = d.leadMedia?.floorPlan?.key;
        return {
          id: String(d.id),
          building_id: buildingId,
          url: unit ? `${buildingUrl}/${unit.toLowerCase()}` : buildingUrl,
          unit: unit || null,
          address: addr,
          neighborhood: bldgRow.neighborhood,
          borough: bldgRow.borough,
          price_monthly: d.price ?? null,
          bedrooms: d.bedroomCount ?? null,
          bathrooms: (d.fullBathroomCount ?? 0) + 0.5 * (d.halfBathroomCount ?? 0) || null,
          sqft: d.livingAreaSize ?? null,
          no_fee: !!d.noFee,
          is_featured: false,
          furnished: !!d.furnished,
          available_at: d.availableAt ?? null,
          months_free: d.monthsFree ?? null,
          lease_term_months: d.leaseTermMonths ?? null,
          image_url: photoKey ? `https://photos.zillowstatic.com/fp/${photoKey}-se_large_800_400.webp` : null,
          floor_plan_url: fpKey ? `https://photos.zillowstatic.com/fp/${fpKey}-se_large_800_400.webp` : null,
          listing_type: "rental",
          is_active: true,
          last_seen_at: new Date().toISOString(),
          source: "apify",
        };
      });

      if (listingRows.length > 0) {
        // Count new
        const ids = listingRows.map(l => l.id);
        const { data: existing } = await supa.from("apt_listings").select("id").in("id", ids);
        const existSet = new Set((existing ?? []).map(r => r.id));
        newListings += listingRows.filter(l => !existSet.has(l.id)).length;

        const { error: lErr } = await supa.from("apt_listings").upsert(listingRows, { onConflict: "id" });
        if (lErr) console.warn(`  listings upsert err: ${lErr.message}`);
        totalListings += listingRows.length;
      }

      console.log(`  ✓ ${bldgRow.name}: ${listingRows.length} listings, ${amenities.length} amenities, ${subways.length} subways`);
    }

    // Mark stale
    const threshold = new Date(Date.now() - 48 * 3600_000).toISOString();
    const { data: stale } = await supa
      .from("apt_listings")
      .update({ is_active: false })
      .lt("last_seen_at", threshold)
      .eq("is_active", true)
      .select("id");

    // Log run
    await supa.from("apt_refresh_runs").insert({
      status: "ok",
      buildings_requested: urls.length,
      buildings_fetched: items.length,
      listings_upserted: totalListings,
      listings_new: newListings,
      listings_inactivated: (stale ?? []).length,
      cost_cents_estimate: Math.round(items.length * 0.35),
      triggered_by: "manual",
      finished_at: new Date().toISOString(),
    });

    console.log(`\n✓ Done: ${items.length} buildings, ${totalListings} listings (${newListings} new), ${(stale ?? []).length} inactivated`);
    console.log(`  Cost estimate: $${(items.length * 0.0035).toFixed(3)}`);
    break;
  }
  if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
    console.error(`\n✗ Actor run ended with status=${status}`);
    process.exit(1);
  }
}
