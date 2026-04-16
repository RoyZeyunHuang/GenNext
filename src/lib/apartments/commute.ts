/**
 * Google Maps integration for richer commute info — transit lines, walking,
 * and driving times for each NYC campus.
 *
 * APIs used (all priced ~$0.005/req, $200/mo free tier):
 *   - Distance Matrix:  walking + driving (1 call each per building, 10 destinations)
 *   - Directions:       transit (1 call per (building × campus), to get route steps)
 *
 * Cost per building: 1 + 1 + 10 = 12 calls ≈ $0.06.
 * Cost per warm of all 35 buildings: ≈ $2.10. Cached per building in JSONB.
 */

import { NYC_CAMPUSES, haversineMiles, estimateCommuteMinutes } from "./constants";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
const STALE_AFTER_DAYS = 30;

export interface TransitStep {
  mode: "WALKING" | "TRANSIT";
  durationMinutes: number;
  instruction: string;       // e.g. "Subway towards Manhattan"
  line?: string;             // e.g. "E"
  vehicle?: string;          // e.g. "Subway", "Bus"
  departureStop?: string;    // e.g. "Court Sq-23 St"
  arrivalStop?: string;      // e.g. "5 Av/53 St"
  numStops?: number;
}

export interface ModeInfo {
  durationMinutes: number;
  distanceMiles?: number;
}

export interface TransitInfo extends ModeInfo {
  lines: string[];           // unique transit lines used in order, e.g. ["E", "1"]
  steps: TransitStep[];
}

export interface CommuteResult {
  campusShortName: string;
  campusName: string;
  transit: TransitInfo | null;
  walking: ModeInfo | null;
  driving: ModeInfo | null;
  source: "google" | "haversine" | "mixed";
}

// --------------------------------------------------------------------- //
//                          Google API callers                           //
// --------------------------------------------------------------------- //

interface DMElement {
  status: string;
  duration?: { value: number };
  distance?: { value: number };
}
interface DMResponse {
  status: string;
  rows?: Array<{ elements: DMElement[] }>;
}

async function distanceMatrix(
  origin: string,
  destinations: string,
  mode: "walking" | "driving"
): Promise<DMElement[] | null> {
  if (!GOOGLE_KEY) return null;
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json?` +
    `origins=${encodeURIComponent(origin)}` +
    `&destinations=${encodeURIComponent(destinations)}` +
    `&mode=${mode}` +
    `&key=${GOOGLE_KEY}`;
  try {
    const res = await fetch(url);
    const json = (await res.json()) as DMResponse;
    if (json.status !== "OK" || !json.rows?.[0]) return null;
    return json.rows[0].elements;
  } catch {
    return null;
  }
}

interface DirStep {
  travel_mode: string;
  duration?: { value: number };
  html_instructions?: string;
  transit_details?: {
    line?: {
      short_name?: string;
      name?: string;
      vehicle?: { type?: string; name?: string };
    };
    departure_stop?: { name?: string };
    arrival_stop?: { name?: string };
    num_stops?: number;
  };
}
interface DirResponse {
  status: string;
  routes?: Array<{
    legs?: Array<{
      duration?: { value: number };
      distance?: { value: number };
      steps?: DirStep[];
    }>;
  }>;
}

function stripHtml(s: string): string {
  return s
    .replace(/<div[^>]*>/g, " · ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

async function transitDirections(
  origin: string,
  destination: string
): Promise<TransitInfo | null> {
  if (!GOOGLE_KEY) return null;
  const url =
    `https://maps.googleapis.com/maps/api/directions/json?` +
    `origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&mode=transit` +
    `&departure_time=now` +
    `&key=${GOOGLE_KEY}`;
  let json: DirResponse;
  try {
    const res = await fetch(url);
    json = (await res.json()) as DirResponse;
  } catch {
    return null;
  }
  const leg = json.routes?.[0]?.legs?.[0];
  if (json.status !== "OK" || !leg?.steps) return null;

  const steps: TransitStep[] = leg.steps.map((s) => {
    const isTransit = s.travel_mode === "TRANSIT";
    const td = s.transit_details;
    return {
      mode: isTransit ? "TRANSIT" : "WALKING",
      durationMinutes: Math.round((s.duration?.value ?? 0) / 60),
      instruction: stripHtml(s.html_instructions ?? ""),
      line: td?.line?.short_name ?? td?.line?.name,
      vehicle: td?.line?.vehicle?.name ?? td?.line?.vehicle?.type,
      departureStop: td?.departure_stop?.name,
      arrivalStop: td?.arrival_stop?.name,
      numStops: td?.num_stops,
    };
  });
  const lines: string[] = [];
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

// --------------------------------------------------------------------- //
//                          Top-level compute                            //
// --------------------------------------------------------------------- //

/**
 * Compute commute via Google for all campuses + all 3 modes.
 * Returns null if Google totally failed, partial entries on per-campus failure.
 */
export async function computeCommutesFromGoogle(
  lat: number,
  lng: number
): Promise<CommuteResult[] | null> {
  if (!GOOGLE_KEY) return null;
  const origin = `${lat},${lng}`;
  const destinationsCsv = NYC_CAMPUSES.map((c) => `${c.lat},${c.lng}`).join("|");

  const [walking, driving] = await Promise.all([
    distanceMatrix(origin, destinationsCsv, "walking"),
    distanceMatrix(origin, destinationsCsv, "driving"),
  ]);

  // Transit: 10 calls in parallel
  const transitResults = await Promise.all(
    NYC_CAMPUSES.map((c) => transitDirections(origin, `${c.lat},${c.lng}`))
  );

  return NYC_CAMPUSES.map((campus, i): CommuteResult => {
    const transit = transitResults[i];
    const walkingEl = walking?.[i];
    const drivingEl = driving?.[i];
    const sourcesUsed: Array<"google" | "haversine"> = [];
    let walkingInfo: ModeInfo | null = null;
    let drivingInfo: ModeInfo | null = null;

    if (walkingEl?.status === "OK" && walkingEl.duration) {
      walkingInfo = { durationMinutes: Math.round(walkingEl.duration.value / 60) };
      sourcesUsed.push("google");
    }
    if (drivingEl?.status === "OK" && drivingEl.duration) {
      drivingInfo = { durationMinutes: Math.round(drivingEl.duration.value / 60) };
      sourcesUsed.push("google");
    }
    if (transit) sourcesUsed.push("google");

    // If transit failed entirely, fall back to haversine for the primary number
    let finalTransit = transit;
    if (!finalTransit) {
      const miles = haversineMiles(lat, lng, campus.lat, campus.lng);
      finalTransit = {
        durationMinutes: estimateCommuteMinutes(miles),
        distanceMiles: miles,
        lines: [],
        steps: [],
      };
      sourcesUsed.push("haversine");
    }

    return {
      campusShortName: campus.shortName,
      campusName: campus.name,
      transit: finalTransit,
      walking: walkingInfo,
      driving: drivingInfo,
      source: sourcesUsed.includes("haversine")
        ? (sourcesUsed.includes("google") ? "mixed" : "haversine")
        : "google",
    };
  });
}

/** Pure haversine fallback for buildings without Google access. */
export function commutesFallback(
  lat: number | null,
  lng: number | null
): CommuteResult[] {
  if (lat == null || lng == null) return [];
  return NYC_CAMPUSES.map((campus) => {
    const miles = haversineMiles(lat, lng, campus.lat, campus.lng);
    return {
      campusShortName: campus.shortName,
      campusName: campus.name,
      transit: {
        durationMinutes: estimateCommuteMinutes(miles),
        distanceMiles: miles,
        lines: [],
        steps: [],
      },
      walking: { durationMinutes: Math.round((miles / 3) * 60) },
      driving: { durationMinutes: Math.round((miles / 22) * 60) + 5 },
      source: "haversine" as const,
    };
  });
}

export function isCommuteCacheStale(fetchedAt: string | null): boolean {
  if (!fetchedAt) return true;
  const age = Date.now() - new Date(fetchedAt).getTime();
  return age > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

export async function getOrComputeCommutes(opts: {
  buildingId: string;
  lat: number | null;
  lng: number | null;
  cached: CommuteResult[] | null;
  cachedAt: string | null;
  saveCache: (results: CommuteResult[]) => Promise<void>;
}): Promise<CommuteResult[]> {
  const { lat, lng, cached, cachedAt, saveCache } = opts;
  // If cached has the new shape (with `transit` field) and is fresh, use it
  const cachedHasNewShape = cached && cached[0] && "transit" in cached[0];
  if (cachedHasNewShape && !isCommuteCacheStale(cachedAt)) return cached!;
  if (lat == null || lng == null) return [];

  const fresh = await computeCommutesFromGoogle(lat, lng);
  if (!fresh) {
    return cachedHasNewShape ? cached! : commutesFallback(lat, lng);
  }
  void saveCache(fresh);
  return fresh;
}
