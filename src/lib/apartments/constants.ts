/**
 * Static constants for the apartments module: subway colors, amenity categories,
 * university campus coordinates for commute estimation.
 */

// ---------- NYC Subway Colors ----------
export const SUBWAY_COLORS: Record<string, string> = {
  "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
  "4": "#00933C", "5": "#00933C", "6": "#00933C",
  "7": "#B933AD",
  A: "#0039A6", C: "#0039A6", E: "#0039A6",
  B: "#FF6319", D: "#FF6319", F: "#FF6319", M: "#FF6319",
  G: "#6CBE45",
  J: "#996633", Z: "#996633",
  L: "#A7A9AC",
  N: "#FCCC0A", Q: "#FCCC0A", R: "#FCCC0A", W: "#FCCC0A",
  S: "#808183",
  SIR: "#2850AD",
  LIRR: "#0F61A9",
  FERRY: "#E89B38",
};

export function subwayBg(route: string): string {
  return SUBWAY_COLORS[route] ?? "#808183";
}

export function subwayFg(route: string): string {
  // Yellow and light lines need dark text
  const darkText = new Set(["N", "Q", "R", "W", "FERRY"]);
  return darkText.has(route) ? "#000" : "#FFF";
}

// ---------- Amenity Categories ----------
export const AMENITY_CATEGORIES: Record<string, string[]> = {
  "Services & Facilities": [
    "concierge", "full_time_doorman", "doorman", "elevator", "laundry",
    "live_in_super", "package_room", "bike_room", "parking", "valet_parking",
    "garage",
  ],
  "Wellness & Recreation": [
    "gym", "pool", "hot_tub", "media_room", "childrens_playroom",
  ],
  "Storage": [
    "storage_room", "cold_storage", "locker_cage",
  ],
  "Shared Outdoor": [
    "roofdeck", "garden", "deck",
  ],
  "Policies": [
    "dogs", "cats", "smoke_free", "guarantors", "wheelchair_access",
  ],
};

export const AMENITY_LABELS: Record<string, string> = {
  concierge: "Concierge",
  full_time_doorman: "Full-time Doorman",
  doorman: "Doorman",
  elevator: "Elevator",
  laundry: "Laundry in Building",
  live_in_super: "Live-in Super",
  package_room: "Package Room",
  bike_room: "Bike Room",
  parking: "Parking",
  valet_parking: "Valet Parking",
  garage: "Garage",
  gym: "Gym",
  pool: "Swimming Pool",
  hot_tub: "Hot Tub",
  media_room: "Media Room",
  childrens_playroom: "Children's Playroom",
  storage_room: "Storage",
  cold_storage: "Cold Storage",
  locker_cage: "Locker/Cage",
  roofdeck: "Roof Deck",
  garden: "Garden",
  deck: "Deck",
  dogs: "Dogs Allowed",
  cats: "Cats Allowed",
  smoke_free: "Smoke-free",
  guarantors: "Guarantors Accepted",
  wheelchair_access: "Wheelchair Access",
};

// ---------- NYC University Campuses ----------
export interface Campus {
  name: string;
  shortName: string;
  lat: number;
  lng: number;
}

export const NYC_CAMPUSES: Campus[] = [
  // NYU — multiple campuses
  { name: "NYU Washington Square", shortName: "NYU WSQ", lat: 40.7295, lng: -73.9965 },
  { name: "NYU Tandon (Brooklyn)", shortName: "NYU Tandon", lat: 40.6942, lng: -73.9857 },
  { name: "NYU Stern (Gould Plaza)", shortName: "NYU Stern", lat: 40.7291, lng: -73.9965 },
  // Columbia
  { name: "Columbia University", shortName: "Columbia", lat: 40.8075, lng: -73.9626 },
  // Art & Design
  { name: "Pratt Institute", shortName: "Pratt", lat: 40.6898, lng: -73.9634 },
  { name: "Parsons School of Design", shortName: "Parsons", lat: 40.7352, lng: -73.9944 },
  { name: "FIT (Fashion Institute)", shortName: "FIT", lat: 40.7470, lng: -73.9930 },
  { name: "SVA (School of Visual Arts)", shortName: "SVA", lat: 40.7389, lng: -73.9907 },
  // Fordham
  { name: "Fordham Lincoln Center", shortName: "Fordham LC", lat: 40.7716, lng: -73.9841 },
  { name: "Fordham Rose Hill (Bronx)", shortName: "Fordham RH", lat: 40.8614, lng: -73.8852 },
];

/**
 * Haversine distance in miles between two lat/lng pairs.
 */
export function haversineMiles(
  lat1: number, lng1: number, lat2: number, lng2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Rough transit commute estimate: distance / avg subway speed + walk buffer.
 * NYC subway averages ~17 mph with stops; ~5 min walk each end.
 */
export function estimateCommuteMinutes(distanceMiles: number): number {
  if (distanceMiles < 0.3) return 5; // walking distance
  return Math.round((distanceMiles / 17) * 60) + 10; // 10 min walk buffer
}

/**
 * Calculate commute from a building to all campuses.
 * Uses building lat/lng if available, otherwise falls back to nearest subway station.
 */
export function computeCommutes(
  buildingLat: number | null,
  buildingLng: number | null,
  subways?: Array<{ name: string; routes: string[]; distance: number; addr_lat?: string; addr_lon?: string }> | null,
): Array<{ campus: Campus; miles: number; minutes: number }> {
  let lat = buildingLat;
  let lng = buildingLng;

  // Fallback: use nearest subway station coordinates
  if ((lat == null || lng == null) && subways?.length) {
    const first = subways[0];
    if (first.addr_lat && first.addr_lon) {
      lat = Number(first.addr_lat);
      lng = Number(first.addr_lon);
    }
  }
  if (lat == null || lng == null) return [];

  return NYC_CAMPUSES.map((campus) => {
    const miles = haversineMiles(lat!, lng!, campus.lat, campus.lng);
    return { campus, miles, minutes: estimateCommuteMinutes(miles) };
  }).sort((a, b) => a.minutes - b.minutes);
}
