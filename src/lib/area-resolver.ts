/**
 * 地址 → 大区 / 小区：优先 5 位 zip，其次关键词正则（与 AREA_MAP 一致）
 */

import { AREA_MAP } from "./area-map-data";

export { AREA_MAP };

export const ZIP_TO_AREA: Record<string, { borough: string; area: string }> = {
  // Manhattan
  "10001": { borough: "Manhattan", area: "Chelsea" },
  "10002": { borough: "Manhattan", area: "Lower East Side" },
  "10003": { borough: "Manhattan", area: "East Village" },
  "10004": { borough: "Manhattan", area: "FiDi" },
  "10005": { borough: "Manhattan", area: "FiDi" },
  "10006": { borough: "Manhattan", area: "FiDi" },
  "10007": { borough: "Manhattan", area: "Tribeca" },
  "10008": { borough: "Manhattan", area: "FiDi" },
  "10009": { borough: "Manhattan", area: "East Village" },
  "10010": { borough: "Manhattan", area: "Gramercy" },
  "10011": { borough: "Manhattan", area: "Chelsea" },
  "10012": { borough: "Manhattan", area: "SoHo" },
  "10013": { borough: "Manhattan", area: "Tribeca" },
  "10014": { borough: "Manhattan", area: "West Village" },
  "10015": { borough: "Manhattan", area: "FiDi" },
  "10016": { borough: "Manhattan", area: "Murray Hill" },
  "10017": { borough: "Manhattan", area: "Midtown" },
  "10018": { borough: "Manhattan", area: "Midtown" },
  "10019": { borough: "Manhattan", area: "Hells Kitchen" },
  "10020": { borough: "Manhattan", area: "Midtown" },
  "10021": { borough: "Manhattan", area: "Upper East Side" },
  "10022": { borough: "Manhattan", area: "Midtown" },
  "10023": { borough: "Manhattan", area: "Upper West Side" },
  "10024": { borough: "Manhattan", area: "Upper West Side" },
  "10025": { borough: "Manhattan", area: "Upper West Side" },
  "10026": { borough: "Manhattan", area: "Harlem" },
  "10027": { borough: "Manhattan", area: "Harlem" },
  "10028": { borough: "Manhattan", area: "Upper East Side" },
  "10029": { borough: "Manhattan", area: "East Harlem" },
  "10030": { borough: "Manhattan", area: "Harlem" },
  "10031": { borough: "Manhattan", area: "Hamilton Heights" },
  "10032": { borough: "Manhattan", area: "Washington Heights" },
  "10033": { borough: "Manhattan", area: "Washington Heights" },
  "10034": { borough: "Manhattan", area: "Inwood" },
  "10035": { borough: "Manhattan", area: "East Harlem" },
  "10036": { borough: "Manhattan", area: "Hells Kitchen" },
  "10037": { borough: "Manhattan", area: "Harlem" },
  "10038": { borough: "Manhattan", area: "FiDi" },
  "10039": { borough: "Manhattan", area: "Harlem" },
  "10040": { borough: "Manhattan", area: "Washington Heights" },
  "10044": { borough: "Manhattan", area: "Roosevelt Island" },
  "10065": { borough: "Manhattan", area: "Upper East Side" },
  "10069": { borough: "Manhattan", area: "Upper West Side" },
  "10075": { borough: "Manhattan", area: "Upper East Side" },
  "10128": { borough: "Manhattan", area: "Upper East Side" },
  "10280": { borough: "Manhattan", area: "Battery Park City" },
  "10281": { borough: "Manhattan", area: "Battery Park City" },
  "10282": { borough: "Manhattan", area: "Battery Park City" },
  /** Marble Hill；与 Bronx 部分 zip 重叠时以先定义的 Manhattan 为准 */
  "10463": { borough: "Manhattan", area: "Marble Hill" },

  // Brooklyn
  "11201": { borough: "Brooklyn", area: "Brooklyn Heights" },
  "11202": { borough: "Brooklyn", area: "Downtown Brooklyn" },
  "11205": { borough: "Brooklyn", area: "Fort Greene" },
  "11206": { borough: "Brooklyn", area: "Williamsburg" },
  "11207": { borough: "Brooklyn", area: "East New York" },
  "11208": { borough: "Brooklyn", area: "East New York" },
  "11209": { borough: "Brooklyn", area: "Bay Ridge" },
  "11210": { borough: "Brooklyn", area: "Flatbush" },
  "11211": { borough: "Brooklyn", area: "Williamsburg" },
  "11212": { borough: "Brooklyn", area: "Brownsville" },
  "11213": { borough: "Brooklyn", area: "Crown Heights" },
  "11214": { borough: "Brooklyn", area: "Bensonhurst" },
  "11215": { borough: "Brooklyn", area: "Park Slope" },
  "11216": { borough: "Brooklyn", area: "Bed-Stuy" },
  "11217": { borough: "Brooklyn", area: "Boerum Hill" },
  "11218": { borough: "Brooklyn", area: "Kensington" },
  "11219": { borough: "Brooklyn", area: "Borough Park" },
  "11220": { borough: "Brooklyn", area: "Sunset Park" },
  "11221": { borough: "Brooklyn", area: "Bushwick" },
  "11222": { borough: "Brooklyn", area: "Greenpoint" },
  "11223": { borough: "Brooklyn", area: "Gravesend" },
  "11224": { borough: "Brooklyn", area: "Coney Island" },
  "11225": { borough: "Brooklyn", area: "Crown Heights" },
  "11226": { borough: "Brooklyn", area: "Flatbush" },
  "11228": { borough: "Brooklyn", area: "Bay Ridge" },
  "11229": { borough: "Brooklyn", area: "Sheepshead Bay" },
  "11230": { borough: "Brooklyn", area: "Midwood" },
  "11231": { borough: "Brooklyn", area: "Carroll Gardens" },
  "11232": { borough: "Brooklyn", area: "Gowanus" },
  "11233": { borough: "Brooklyn", area: "Bed-Stuy" },
  "11234": { borough: "Brooklyn", area: "Canarsie" },
  "11235": { borough: "Brooklyn", area: "Sheepshead Bay" },
  "11236": { borough: "Brooklyn", area: "Canarsie" },
  "11237": { borough: "Brooklyn", area: "Bushwick" },
  "11238": { borough: "Brooklyn", area: "Prospect Heights" },
  "11239": { borough: "Brooklyn", area: "East New York" },
  "11241": { borough: "Brooklyn", area: "Downtown Brooklyn" },
  "11242": { borough: "Brooklyn", area: "DUMBO" },
  "11243": { borough: "Brooklyn", area: "DUMBO" },
  "11249": { borough: "Brooklyn", area: "Williamsburg" },
  "11251": { borough: "Brooklyn", area: "Downtown Brooklyn" },

  // Queens
  "11101": { borough: "Queens", area: "LIC" },
  "11102": { borough: "Queens", area: "Astoria" },
  "11103": { borough: "Queens", area: "Astoria" },
  "11104": { borough: "Queens", area: "Sunnyside" },
  "11105": { borough: "Queens", area: "Astoria" },
  "11106": { borough: "Queens", area: "Astoria" },
  "11109": { borough: "Queens", area: "LIC" },
  "11120": { borough: "Queens", area: "LIC" },
  "11354": { borough: "Queens", area: "Flushing" },
  "11355": { borough: "Queens", area: "Flushing" },
  "11372": { borough: "Queens", area: "Jackson Heights" },
  "11373": { borough: "Queens", area: "Elmhurst" },
  "11374": { borough: "Queens", area: "Rego Park" },
  "11375": { borough: "Queens", area: "Forest Hills" },
  "11377": { borough: "Queens", area: "Woodside" },
  "11378": { borough: "Queens", area: "Maspeth" },
  "11385": { borough: "Queens", area: "Ridgewood" },
  "11432": { borough: "Queens", area: "Jamaica" },
  "11433": { borough: "Queens", area: "Jamaica" },
  "11434": { borough: "Queens", area: "Jamaica" },
  "11361": { borough: "Queens", area: "Bayside" },
  "11364": { borough: "Queens", area: "Fresh Meadows" },

  // Bronx（不含 10463，避免与 Manhattan Marble Hill 重复）
  "10451": { borough: "Bronx", area: "Mott Haven" },
  "10452": { borough: "Bronx", area: "Morris Heights" },
  "10453": { borough: "Bronx", area: "Morris Heights" },
  "10454": { borough: "Bronx", area: "Mott Haven" },
  "10455": { borough: "Bronx", area: "South Bronx" },
  "10456": { borough: "Bronx", area: "South Bronx" },
  "10457": { borough: "Bronx", area: "Fordham" },
  "10458": { borough: "Bronx", area: "Fordham" },
  "10459": { borough: "Bronx", area: "South Bronx" },
  "10460": { borough: "Bronx", area: "South Bronx" },
  "10461": { borough: "Bronx", area: "Pelham Bay" },
  "10462": { borough: "Bronx", area: "Pelham Bay" },
  "10464": { borough: "Bronx", area: "Throgs Neck" },
  "10465": { borough: "Bronx", area: "Throgs Neck" },
  "10466": { borough: "Bronx", area: "Baychester" },
  "10467": { borough: "Bronx", area: "Fordham" },
  "10468": { borough: "Bronx", area: "Kingsbridge" },
  "10469": { borough: "Bronx", area: "Baychester" },
  "10470": { borough: "Bronx", area: "Riverdale" },
  "10471": { borough: "Bronx", area: "Riverdale" },
  "10472": { borough: "Bronx", area: "South Bronx" },
  "10473": { borough: "Bronx", area: "South Bronx" },
  "10474": { borough: "Bronx", area: "South Bronx" },
  "10475": { borough: "Bronx", area: "Baychester" },

  // Staten Island
  "10301": { borough: "Staten Island", area: "St. George" },
  "10302": { borough: "Staten Island", area: "Stapleton" },
  "10304": { borough: "Staten Island", area: "Stapleton" },
  "10305": { borough: "Staten Island", area: "Rosebank" },
  "10306": { borough: "Staten Island", area: "Todt Hill" },
  "10310": { borough: "Staten Island", area: "St. George" },
  "10314": { borough: "Staten Island", area: "Todt Hill" },

  // Jersey City
  "07302": { borough: "Jersey City", area: "Downtown JC" },
  "07304": { borough: "Jersey City", area: "The Waterfront" },
  "07305": { borough: "Jersey City", area: "Bergen-Lafayette" },
  "07306": { borough: "Jersey City", area: "Journal Square" },
  "07307": { borough: "Jersey City", area: "The Waterfront" },
  "07310": { borough: "Jersey City", area: "Newport" },
  "07311": { borough: "Jersey City", area: "Paulus Hook" },

  // Hoboken
  "07030": { borough: "Hoboken", area: "Hoboken" },

  // Other NJ
  "07086": { borough: "Other NJ", area: "Weehawken" },
  "07087": { borough: "Other NJ", area: "Union City" },
  "07093": { borough: "Other NJ", area: "West New York" },
  "07020": { borough: "Other NJ", area: "Edgewater" },
  "07024": { borough: "Other NJ", area: "Fort Lee" },
  "07102": { borough: "Other NJ", area: "Newark" },
  "07103": { borough: "Other NJ", area: "Newark" },
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 由 AREA_MAP 生成：长名称优先，短名用词边界（与旧 resolve-area 行为一致） */
function buildAddressPatterns(): { pattern: RegExp; borough: string; area: string }[] {
  const rules: { pattern: RegExp; borough: string; area: string }[] = [];
  for (const [borough, subAreas] of Object.entries(AREA_MAP)) {
    const sorted = [...subAreas].sort((a, b) => b.length - a.length);
    for (const sub of sorted) {
      if (sub.length <= 5) {
        rules.push({
          pattern: new RegExp(`\\b${escapeRegExp(sub)}\\b`, "i"),
          borough,
          area: sub,
        });
      } else {
        rules.push({
          pattern: new RegExp(escapeRegExp(sub), "i"),
          borough,
          area: sub,
        });
      }
    }
  }
  return rules.sort((a, b) => b.area.length - a.area.length);
}

export const ADDRESS_PATTERNS = buildAddressPatterns();

export function resolveArea(address: string | null | undefined): {
  borough: string | null;
  area: string | null;
} {
  if (!address || !String(address).trim()) return { borough: null, area: null };

  const addr = address.trim();

  const zipMatch = addr.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zip = zipMatch[1];
    const hit = ZIP_TO_AREA[zip];
    if (hit) return { borough: hit.borough, area: hit.area };
  }

  for (const rule of ADDRESS_PATTERNS) {
    if (rule.pattern.test(addr)) {
      return { borough: rule.borough, area: rule.area };
    }
  }

  return { borough: null, area: null };
}
