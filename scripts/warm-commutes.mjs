#!/usr/bin/env node
/**
 * Pre-warm Google Maps commutes for every tracked building with lat/lng.
 * Computes transit (with route steps + lines), walking, and driving times
 * for each of the 10 NYC campuses.
 *
 * Cost: ~$0.06 per building (12 API calls × $0.005)
 *       ≈ $2.10 for all 35 buildings
 *
 *   node --env-file=.env.local scripts/warm-commutes.mjs
 */
import { createClient } from "@supabase/supabase-js";

const KEY = process.env.GOOGLE_MAPS_API_KEY;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) throw new Error("GOOGLE_MAPS_API_KEY missing");
if (!SUPA_URL || !SUPA_KEY) throw new Error("Supabase env missing");

const NYC_CAMPUSES = [
  { name: "NYU Washington Square", shortName: "NYU WSQ", lat: 40.7295, lng: -73.9965 },
  { name: "NYU Tandon (Brooklyn)", shortName: "NYU Tandon", lat: 40.6942, lng: -73.9857 },
  { name: "NYU Stern (Gould Plaza)", shortName: "NYU Stern", lat: 40.7291, lng: -73.9965 },
  { name: "Columbia University", shortName: "Columbia", lat: 40.8075, lng: -73.9626 },
  { name: "Pratt Institute", shortName: "Pratt", lat: 40.6898, lng: -73.9634 },
  { name: "Parsons School of Design", shortName: "Parsons", lat: 40.7352, lng: -73.9944 },
  { name: "FIT (Fashion Institute)", shortName: "FIT", lat: 40.7470, lng: -73.9930 },
  { name: "SVA (School of Visual Arts)", shortName: "SVA", lat: 40.7389, lng: -73.9907 },
  { name: "Fordham Lincoln Center", shortName: "Fordham LC", lat: 40.7716, lng: -73.9841 },
  { name: "Fordham Rose Hill (Bronx)", shortName: "Fordham RH", lat: 40.8614, lng: -73.8852 },
];

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stripHtml(s) {
  return (s || "").replace(/<div[^>]*>/g, " · ").replace(/<[^>]+>/g, "").trim();
}

async function distanceMatrix(origin, dests, mode) {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?` +
    `origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(dests)}&mode=${mode}&key=${KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  return json.status === "OK" ? json.rows?.[0]?.elements ?? null : null;
}

async function transitDirections(origin, dest) {
  const url = `https://maps.googleapis.com/maps/api/directions/json?` +
    `origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}` +
    `&mode=transit&departure_time=now&key=${KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  const leg = json.routes?.[0]?.legs?.[0];
  if (json.status !== "OK" || !leg?.steps) return null;
  const steps = leg.steps.map((s) => {
    const td = s.transit_details;
    return {
      mode: s.travel_mode === "TRANSIT" ? "TRANSIT" : "WALKING",
      durationMinutes: Math.round((s.duration?.value ?? 0) / 60),
      instruction: stripHtml(s.html_instructions),
      line: td?.line?.short_name ?? td?.line?.name,
      vehicle: td?.line?.vehicle?.name ?? td?.line?.vehicle?.type,
      departureStop: td?.departure_stop?.name,
      arrivalStop: td?.arrival_stop?.name,
      numStops: td?.num_stops,
    };
  });
  const lines = [];
  for (const st of steps) {
    if (st.mode === "TRANSIT" && st.line && !lines.includes(st.line)) lines.push(st.line);
  }
  return {
    durationMinutes: Math.round((leg.duration?.value ?? 0) / 60),
    distanceMiles: (leg.distance?.value ?? 0) / 1609.34,
    lines,
    steps,
  };
}

async function computeAll(lat, lng) {
  const origin = `${lat},${lng}`;
  const destsCsv = NYC_CAMPUSES.map((c) => `${c.lat},${c.lng}`).join("|");
  const [walking, driving] = await Promise.all([
    distanceMatrix(origin, destsCsv, "walking"),
    distanceMatrix(origin, destsCsv, "driving"),
  ]);
  const transitResults = await Promise.all(
    NYC_CAMPUSES.map((c) => transitDirections(origin, `${c.lat},${c.lng}`))
  );
  return NYC_CAMPUSES.map((campus, i) => {
    let transit = transitResults[i];
    if (!transit) {
      const miles = haversineMiles(lat, lng, campus.lat, campus.lng);
      transit = {
        durationMinutes: Math.round((miles / 17) * 60) + 10,
        distanceMiles: miles,
        lines: [],
        steps: [],
      };
    }
    const w = walking?.[i];
    const d = driving?.[i];
    return {
      campusShortName: campus.shortName,
      campusName: campus.name,
      transit,
      walking: w?.status === "OK" && w.duration ? { durationMinutes: Math.round(w.duration.value / 60) } : null,
      driving: d?.status === "OK" && d.duration ? { durationMinutes: Math.round(d.duration.value / 60) } : null,
      source: "google",
    };
  });
}

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const { data: bldgs, error } = await supa
  .from("apt_buildings")
  .select("id, name, latitude, longitude")
  .eq("is_tracked", true)
  .not("latitude", "is", null)
  .not("longitude", "is", null);
if (error) throw error;
console.log(`Pre-warming commutes for ${bldgs.length} buildings...\n`);

let ok = 0, errCount = 0;
for (const b of bldgs) {
  try {
    const results = await computeAll(Number(b.latitude), Number(b.longitude));
    await supa.from("apt_buildings")
      .update({ commutes: results, commutes_fetched_at: new Date().toISOString() })
      .eq("id", b.id);
    const fastest = results.slice().sort((a, b) => a.transit.durationMinutes - b.transit.durationMinutes)[0];
    const lines = fastest.transit.lines.length > 0 ? `[${fastest.transit.lines.join(",")}]` : "(walk)";
    console.log(`  ✓ ${b.name.padEnd(32)} → ${fastest.campusShortName.padEnd(12)} ${String(fastest.transit.durationMinutes).padStart(3)}min ${lines}`);
    ok++;
  } catch (e) {
    console.log(`  ✗ ${b.name}: ${e.message}`);
    errCount++;
  }
  await new Promise((r) => setTimeout(r, 100));
}
console.log(`\n${ok} ok, ${errCount} failed. Cost ≈ $${(ok * 0.06).toFixed(2)}`);
