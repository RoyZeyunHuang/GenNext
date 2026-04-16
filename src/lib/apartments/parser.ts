/**
 * Flatten an Apify `memo23/streeteasy-ppr` dataset item into rows for
 * `apt_buildings` + `apt_listings`. Mirrors the Python version at
 * /Users/roycehuang/ClaudeApps/TheMoniter/src/apify_parser.py.
 */

import type {
  ApifyActorItem,
} from "./apify";
import type {
  ParsedBuilding,
  ParsedListing,
  SubwayStation,
  School,
  HotBuildingSeed,
} from "./types";
import { HOT_BUILDINGS } from "./hot_buildings";

const IMG_URL_FMT = (key: string) =>
  `https://photos.zillowstatic.com/fp/${key}-se_large_800_400.webp`;
const FLOOR_PLAN_URL_FMT = (key: string) =>
  `https://photos.zillowstatic.com/fp/${key}-se_large_800_400.webp`;

function s(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

function n(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const x = Number(v);
    return Number.isNaN(x) ? null : x;
  }
  return null;
}

/** Round to integer. Use for fields whose Supabase column is `integer`. */
function nInt(v: unknown): number | null {
  const x = n(v);
  return x == null ? null : Math.round(x);
}

function asJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "object") return v as T;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function listingUrl(buildingUrl: string, unit: string): string {
  const unitNorm = unit.trim().toLowerCase().replace(/^#/, "");
  return unitNorm ? `${buildingUrl.replace(/\/$/, "")}/${unitNorm}` : buildingUrl;
}

interface LeadMedia {
  photo?: { key?: string };
  floorPlan?: { key?: string };
}

interface Digest {
  id?: string | number;
  unit?: string;
  status?: string;
  availableAt?: string;
  bedroomCount?: number;
  fullBathroomCount?: number;
  halfBathroomCount?: number;
  livingAreaSize?: number | null;
  price?: number;
  noFee?: boolean;
  leaseTermMonths?: number;
  monthsFree?: number;
  leadMedia?: LeadMedia;
  furnished?: boolean;
}

function bedrooms(d: Digest): number | null {
  if (d.bedroomCount == null) return null;
  return Number(d.bedroomCount);
}

function bathrooms(d: Digest): number | null {
  const full = Number(d.fullBathroomCount ?? 0);
  const half = Number(d.halfBathroomCount ?? 0);
  const sum = full + 0.5 * half;
  return sum > 0 ? sum : null;
}

function amenitiesFromJson(raw: unknown): string[] {
  const arr = asJson<Array<{ id?: string }>>(raw, []);
  return arr.map((a) => a?.id).filter((x): x is string => typeof x === "string");
}

function subwaysFromJson(raw: unknown): SubwayStation[] {
  const arr = asJson<Array<{ station_name?: string; routes?: string[]; distance?: number }>>(raw, []);
  return arr
    .map((sb) => ({
      name: String(sb.station_name ?? ""),
      routes: Array.isArray(sb.routes) ? sb.routes.map(String) : [],
      distance: Number(sb.distance ?? 0),
    }))
    .filter((x) => x.name);
}

function schoolsFromJson(raw: unknown): School[] {
  const arr = asJson<
    Array<{ name?: string; district?: string; grades?: string[]; address?: School["address"] }>
  >(raw, []);
  return arr
    .map((sc) => ({
      name: String(sc.name ?? ""),
      district: sc.district,
      grades: Array.isArray(sc.grades) ? sc.grades.map(String) : undefined,
      address: sc.address,
    }))
    .filter((x) => x.name);
}

/** Return one building + many listings from a single actor item. */
export function parseApifyItem(
  item: ApifyActorItem
): { building: ParsedBuilding; listings: ParsedListing[] } {
  const buildingId = String(item.building_id ?? item.basicInfo_id ?? "");
  const buildingUrl = String(
    item.building_url ?? item.originalAddress ?? ""
  );
  const building: ParsedBuilding = {
    id: buildingId,
    name: String(item.building_title ?? item.building_subtitle ?? buildingUrl),
    address: s(item.building_subtitle),
    neighborhood: s(item.building_area_name),
    borough: s(item.building_area_borough_name),
    building_url: buildingUrl,
    year_built: n(item.building_year_built),
    floor_count: n(item.building_floor_count),
    unit_count: n(item.building_residential_unit_count),
    active_rentals_count: n(item.building_active_rentals_count),
    open_rentals_count: n(item.building_open_rentals_count),
    closed_rentals_count: n(item.building_closed_rentals_count),
    is_new_development: Boolean(item.building_is_new_development),
    image_url: s(item.building_medium_image_uri),
    official_url: s(item.building_building_showcase_website),
    leasing_phone: s(item.building_building_showcase_phone),
    leasing_company: s(item.building_building_showcase_company_name),
    amenities: amenitiesFromJson(item.building_amenities_json),
    subways: subwaysFromJson(item.building_nearby_subways_json),
    schools: schoolsFromJson(item.building_nearby_schools_json),
    description: s(item.buildingById_description),
    latitude: n(item.building_address_latitude),
    longitude: n(item.building_address_longitude),
  };

  const digests = asJson<Digest[]>(
    item.buildingById_rentalInventorySummary_availableListingDigests_json ?? [],
    []
  );
  const listings: ParsedListing[] = [];
  const seenIds = new Set<string>();
  for (const d of digests) {
    if (!d || typeof d !== "object") continue;
    const id = String(d.id ?? "");
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    const unit = (d.unit ?? "").toString();
    const addr = building.address && unit ? `${building.address} #${unit}` : building.address;
    const photo = d.leadMedia?.photo?.key;
    const floorPlan = d.leadMedia?.floorPlan?.key;
    listings.push({
      id,
      building_id: buildingId,
      url: listingUrl(buildingUrl, unit),
      unit: unit || null,
      address: addr,
      price_monthly: nInt(d.price),            // integer column
      bedrooms: bedrooms(d),
      bathrooms: bathrooms(d),
      sqft: n(d.livingAreaSize),               // numeric column (widened in 054)
      no_fee: Boolean(d.noFee),
      furnished: Boolean(d.furnished),
      available_at: s(d.availableAt),
      months_free: n(d.monthsFree),
      lease_term_months: n(d.leaseTermMonths),
      image_url: photo ? IMG_URL_FMT(photo) : null,
      floor_plan_url: floorPlan ? FLOOR_PLAN_URL_FMT(floorPlan) : null,
      listing_type: "rental",
    });
  }

  return { building, listings };
}

/** Utility: match a listing's URL/address against hot buildings catalog. */
export function matchHot(url: string | null | undefined, address: string | null | undefined): HotBuildingSeed | null {
  const u = (url ?? "").toLowerCase();
  for (const b of HOT_BUILDINGS) {
    if (b.buildingSlug && u.includes(`/${b.buildingSlug.toLowerCase()}/`)) return b;
    for (const h of b.slugHints ?? []) {
      if (h && u.includes(h.toLowerCase())) return b;
    }
  }
  if (address) {
    for (const b of HOT_BUILDINGS) {
      for (const pat of b.addressPatterns ?? []) {
        if (pat.test(address)) return b;
      }
    }
  }
  return null;
}
