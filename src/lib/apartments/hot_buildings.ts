/**
 * Curated list of NYC/NJ buildings with high Chinese-international-student
 * density, verified against StreetEasy canonical URLs.
 *
 * Source of truth: /Users/roycehuang/ClaudeApps/TheMoniter/src/hot_buildings.py
 * Keep the two in sync. Matching logic is mirrored in parser.ts::matchHot.
 */

import type { HotBuildingSeed } from "./types";

/** LIC (Queens) — existing + from team deal spreadsheet. */
const LIC: HotBuildingSeed[] = [
  // ---- new 2024-2026 ----
  { name: "The Orchard", address: "42-06 Orchard Street", area: "lic", tag: "new_2026",
    buildingSlug: "the-orchard-42-06-orchard-street",
    slugHints: ["the-orchard", "42-06-orchard", "42_06-orchard"],
    note: "70-story, 824 units; leased Jan 2026 — huge new tower, Chinese-student beacon" },
  { name: "Jasper", address: "2-33 50th Avenue", area: "lic", tag: "new_2025",
    buildingSlug: "jasper-2_33-50-avenue-long_island_city",
    slugHints: ["jasper", "2_33-50"] },
  { name: "The Italic", address: "26-32 Jackson Avenue", area: "lic", tag: "new_2025",
    buildingSlug: "the-italic",
    slugHints: ["the-italic", "26_32-jackson", "26-32-jackson"],
    note: "50-story, 363 units; sister to The Bold (boldanditalic.com)" },
  { name: "The Bold", address: "27-01 Jackson Avenue", area: "lic", tag: "new_2024",
    buildingSlug: "the-bold",
    slugHints: ["the-bold", "27_01-jackson", "27-01-jackson"] },
  { name: "Lumen LIC", address: "23-15 44th Road", area: "lic", tag: "new_2024",
    buildingSlug: "lumen-lic",
    slugHints: ["lumen-lic", "lumen_lic"],
    note: "66-story, 938 units, 75ft indoor pool" },
  { name: "2-21 Malt Drive", address: "2-21 Malt Drive", area: "lic", tag: "new_2024",
    buildingSlug: "2-21-malt-dr",
    slugHints: ["2-21-malt", "2_21-malt"],
    note: "38-story Hunter's Point South" },
  { name: "Gotham Point", address: "2-15 Malt Drive", area: "lic", tag: "new_2024",
    buildingSlug: "gotham-point",
    slugHints: ["gotham-point", "2_15-malt"] },
  { name: "Bevel LIC", address: "30-02 39th Avenue", area: "lic", tag: "new_2024",
    buildingSlug: "arc-30_02-39th-avenue-queens",
    slugHints: ["bevel-lic", "arc-30_02", "arc-30-02"] },
  // ---- core 2016-2021 ----
  { name: "Skyline Tower", address: "3 Court Square", area: "lic", tag: "core",
    buildingSlug: "skyline-tower",
    slugHints: ["skyline-tower", "3-court-square", "3_court"],
    note: "67-story condo, 802 units; rentals are owner-sublets" },
  { name: "Jackson Park", address: "28-40 Jackson Avenue", area: "lic", tag: "core",
    buildingSlug: "28_40-jackson-avenue-long_island_city",
    slugHints: ["jackson-park", "28_40-jackson", "28_10-jackson", "28_34-jackson"],
    note: "3-building complex — densest Chinese tenant base in LIC" },
  { name: "Jackson Park Tower 3", address: "28-10 Jackson Avenue", area: "lic", tag: "core",
    buildingSlug: "28_10-jackson-avenue-long_island_city",
    slugHints: ["28_10-jackson", "28-10-jackson"] },
  { name: "The Hayden", address: "4610 Center Boulevard", area: "lic", tag: "core",
    buildingSlug: "4610-center-blvd",
    slugHints: ["the-hayden", "hayden-4610", "4610-center", "4610-center-blvd"],
    note: 'StreetEasy title is now "4610 Center Blvd"' },
  { name: "Sven", address: "29-59 Northern Boulevard", area: "lic", tag: "core",
    buildingSlug: "sven-29_59-northern-boulevard-long_island_city",
    slugHints: ["sven", "29_59-northern", "29-59-northern"] },
  { name: "ALTA LIC", address: "29-22 Northern Boulevard", area: "lic", tag: "core",
    buildingSlug: "alta-lic",
    slugHints: ["alta-lic", "alta_lic", "29_22-northern"] },
  { name: "Watermark LIC", address: "27-19 44th Drive", area: "lic", tag: "core",
    buildingSlug: "watermark-lic",
    slugHints: ["watermark", "27_19-44", "27-19-44"] },
  { name: "Tower 28", address: "42-12 28th Street", area: "lic", tag: "core",
    buildingSlug: "tower-28",
    slugHints: ["tower-28", "tower_28", "42_12-28", "42-12-28"] },
  { name: "Eagle Lofts", address: "43-22 Queens Street", area: "lic", tag: "core",
    buildingSlug: "eagle-lofts",
    slugHints: ["eagle-lofts", "eagle_lofts", "43_22-queens"] },
  { name: "Hunter's Point South Living", address: "1-50 50th Avenue", area: "lic", tag: "core",
    buildingSlug: "hunters-point-south-living",
    slugHints: ["hunter's-point-south", "hunters-point-south", "1_50-50"] },
  { name: "The Forge", address: "44-28 Purves Street", area: "lic", tag: "core",
    buildingSlug: "the-forge",
    slugHints: ["the-forge", "forge-44_28", "44_28-purves"] },
  { name: "Galerie LIC", address: "22-22 Jackson Avenue", area: "lic", tag: "core",
    buildingSlug: "galerie-lic",
    slugHints: ["galerie", "22_22-jackson"] },
  { name: "27 on 27th", address: "42-20 27th Street", area: "lic", tag: "core",
    buildingSlug: "27-on-27th",
    slugHints: ["27-on-27", "27_on_27", "42_20-27"] },
  { name: "Dutch LIC", address: "25-30 Northern Boulevard", area: "lic", tag: "core",
    buildingSlug: "dutch-lic",
    slugHints: ["dutch-lic", "25_30-northern"] },
  { name: "Court Square City View", address: "24-16 Queens Plaza South", area: "lic", tag: "core",
    buildingSlug: "24_16-queens-plaza-south-long_island_city",
    slugHints: ["court-square-city-view", "24_16-queens-plaza"] },
  { name: "5Pointz LIC", address: "22-44 Jackson Avenue", area: "lic", tag: "core",
    buildingSlug: "5pointz-lic",
    slugHints: ["5pointz-lic", "5pointz", "22_44-jackson", "22-44-jackson"],
    note: "Pair of 41 + 47-story towers, 1,115 units" },
  { name: "42-62 Hunter Street", address: "42-62 Hunter Street", area: "lic", tag: "core",
    buildingSlug: "42_62-hunter-street-long_island_city",
    slugHints: ["42-62-hunter", "42_62-hunter"] },
];

/** Queens (non-LIC) — Cornell commute / budget. */
const QUEENS: HotBuildingSeed[] = [
  { name: "Vista 65", address: "97-12 65th Road", area: "queens", tag: "new_2024",
    buildingSlug: "vista65",
    slugHints: ["vista-65", "vista65", "97_12-65", "97-12-65"],
    note: "Rego Park, 22 stories; Cornell Tech / Queens College commuters" },
];

/** Manhattan — NYU / Columbia / Roosevelt Island (Cornell Tech). */
const MANHATTAN: HotBuildingSeed[] = [
  { name: "The Ritz Plaza", address: "235 West 48th Street", area: "manhattan", tag: "core",
    buildingSlug: "the-ritz-plaza",
    slugHints: ["the-ritz-plaza", "235-west-48"],
    note: "Midtown West, 45 stories, 479 units (Stonehenge)" },
  { name: "The Octagon", address: "888 Main Street", area: "manhattan", tag: "core",
    buildingSlug: "the-octagon",
    slugHints: ["the-octagon", "888-main"],
    note: "Roosevelt Island — Cornell Tech popular" },
  { name: "Miramar", address: "407 West 206th Street", area: "manhattan", tag: "new_2024",
    buildingSlug: "miramar-at-407-west-206th-street",
    slugHints: ["miramar-at-407", "miramar-at-405", "miramar"],
    note: "Inwood, 698 units, Columbia-favorite" },
  { name: "MIMA", address: "450 West 42nd Street", area: "manhattan", tag: "core",
    buildingSlug: "mima-450-west-42nd-street-new_york",
    slugHints: ["mima", "450-west-42"],
    note: "Midtown West / Hell's Kitchen" },
  { name: "Manhattan Park", address: "10-40 River Road", area: "manhattan", tag: "core",
    buildingSlug: "manhattan-park-10_40-river-road-new_york",
    slugHints: ["manhattan-park", "10_40-river", "river-road"],
    note: "Roosevelt Island — Cornell Tech; 4-building complex" },
  { name: "Lyra", address: "555 West 38th Street", area: "manhattan", tag: "new_2025",
    buildingSlug: "lyra-555-west-38th-street-new_york",
    slugHints: ["lyra", "lyra-nyc", "555-west-38"] },
  { name: "Stuyvesant Town", address: "Stuyvesant Town", area: "manhattan", tag: "legacy",
    buildingSlug: "stuyvesant-town",
    slugHints: ["stuyvesant-town", "stuytown", "peter-cooper-village"],
    note: "Huge rental campus — 11,000+ units; StreetEasy lists as complex" },
  { name: "1440 Amsterdam Avenue", address: "1440 Amsterdam Avenue", area: "manhattan", tag: "new_2024",
    buildingSlug: "1440-amsterdam",
    slugHints: ["1440-amsterdam"],
    note: "Morningside Heights — Columbia students" },
  { name: "448 East 107th Street", address: "448 East 107th Street", area: "manhattan", tag: "core",
    buildingSlug: "448-east-107-street-new_york",
    slugHints: ["448-east-107"],
    note: "East Harlem" },
];

const BROOKLYN: HotBuildingSeed[] = [
  { name: "The Highland", address: "(Brooklyn — exact addr TBD)", area: "brooklyn", tag: "core",
    buildingSlug: "the-highland",
    slugHints: ["the-highland"] },
];

const JERSEY_CITY: HotBuildingSeed[] = [
  { name: "Journal Squared", address: "605 Pavonia Avenue", area: "jersey_city", tag: "core",
    buildingSlug: "journal-squared",
    slugHints: ["journal-squared", "605-pavonia"],
    note: "3-tower complex at Journal Square PATH station" },
  { name: "555 Summit Avenue", address: "555 Summit Avenue", area: "jersey_city", tag: "core",
    buildingSlug: "555-summit-avenue-jersey_city",
    slugHints: ["555-summit"], note: "JC Heights" },
  { name: "43 Cottage Street", address: "43 Cottage Street", area: "jersey_city", tag: "core",
    buildingSlug: "43-cottage-street-jersey_city",
    slugHints: ["43-cottage"] },
  { name: "351 Marin Boulevard", address: "351 Marin Boulevard", area: "jersey_city", tag: "core",
    buildingSlug: "351-marin-boulevard-jersey_city",
    slugHints: ["351-marin"] },
];

export const HOT_BUILDINGS: readonly HotBuildingSeed[] = [
  ...LIC, ...QUEENS, ...MANHATTAN, ...BROOKLYN, ...JERSEY_CITY,
];

export const AREAS: readonly { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "lic", label: "LIC" },
  { value: "queens", label: "Queens" },
  { value: "manhattan", label: "Manhattan" },
  { value: "brooklyn", label: "Brooklyn" },
  { value: "jersey_city", label: "Jersey City" },
];

export function buildingUrlForSeed(s: HotBuildingSeed): string {
  return `https://streeteasy.com/building/${s.buildingSlug}`;
}

export function findSeedByName(name: string): HotBuildingSeed | undefined {
  return HOT_BUILDINGS.find((b) => b.name === name);
}

export function findSeedBySlug(slug: string): HotBuildingSeed | undefined {
  return HOT_BUILDINGS.find((b) => b.buildingSlug === slug);
}
