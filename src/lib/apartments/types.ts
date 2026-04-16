/**
 * Shared types for the apartments module.
 * Mirrors the `apt_*` tables in Supabase (see supabase/migrations/053_apartments.sql).
 */

export type Area = "lic" | "queens" | "manhattan" | "brooklyn" | "jersey_city";
export type Tag = "new_2026" | "new_2025" | "new_2024" | "new_2023" | "core" | "legacy";

/** Static catalog entry (imported from hot_buildings.ts, seeded into DB). */
export interface HotBuildingSeed {
  name: string;
  shortName?: string;
  address: string;
  neighborhood?: string;
  borough?: string;
  area: Area;
  tag: Tag;
  buildingSlug: string;
  slugHints?: readonly string[];
  addressPatterns?: readonly RegExp[];
  note?: string;
}

/** Row from `apt_buildings`. */
export interface Building {
  id: string;
  name: string;
  short_name: string | null;
  address: string | null;
  neighborhood: string | null;
  borough: string | null;
  area: Area;
  tag: Tag | null;
  building_url: string;
  building_slug: string | null;
  official_url: string | null;
  leasing_phone: string | null;
  leasing_company: string | null;
  year_built: number | null;
  floor_count: number | null;
  unit_count: number | null;
  active_rentals_count: number | null;
  open_rentals_count: number | null;
  closed_rentals_count: number | null;
  is_new_development: boolean;
  image_url: string | null;
  amenities: string[] | null;
  subways: SubwayStation[] | null;
  schools: School[] | null;
  description: string | null;
  note: string | null;
  is_tracked: boolean;
  tracked_at: string | null;
  last_fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubwayStation {
  name: string;
  routes: string[];
  distance: number;
}

export interface School {
  name: string;
  district?: string;
  grades?: string[];
  address?: { street?: string; city?: string; state?: string; zip?: string };
}

/** Row from `apt_listings`. */
export interface Listing {
  id: string;
  building_id: string | null;
  url: string;
  unit: string | null;
  address: string | null;
  neighborhood: string | null;
  borough: string | null;
  price_monthly: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  no_fee: boolean;
  is_featured: boolean;
  furnished: boolean;
  available_at: string | null;
  months_free: number | null;
  lease_term_months: number | null;
  image_url: string | null;
  floor_plan_url: string | null;
  listing_type: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  source: string;
}

export interface BuildingNote {
  id: string;
  building_id: string;
  author_id: string | null;
  author_email: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface ListingNote {
  id: string;
  listing_id: string;
  author_id: string | null;
  author_email: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface RefreshRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "blocked" | "error";
  buildings_requested: number;
  buildings_fetched: number;
  listings_upserted: number;
  listings_new: number;
  listings_inactivated: number;
  cost_cents_estimate: number | null;
  error_message: string | null;
  triggered_by: "cron" | "manual" | "migration" | null;
}

/** Parsed shape we upsert, derived from Apify actor JSON. */
export interface ParsedBuilding {
  id: string;
  name: string;
  address: string | null;
  neighborhood: string | null;
  borough: string | null;
  building_url: string;
  year_built: number | null;
  floor_count: number | null;
  unit_count: number | null;
  active_rentals_count: number | null;
  open_rentals_count: number | null;
  closed_rentals_count: number | null;
  is_new_development: boolean;
  image_url: string | null;
  official_url: string | null;
  leasing_phone: string | null;
  leasing_company: string | null;
  amenities: string[];
  subways: SubwayStation[];
  schools: School[];
  description: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ParsedListing {
  id: string;
  building_id: string;
  url: string;
  unit: string | null;
  address: string | null;
  price_monthly: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  no_fee: boolean;
  furnished: boolean;
  available_at: string | null;
  months_free: number | null;
  lease_term_months: number | null;
  image_url: string | null;
  floor_plan_url: string | null;
  listing_type: string;
}
