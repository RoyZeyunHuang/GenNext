/**
 * 手工 override：对地址缺 ZIP 导致 resolveArea 无法识别的楼盘，直接按楼盘名指派 area。
 *
 *   npx tsx scripts/backfill-property-neighborhood-manual.ts          # dry-run
 *   npx tsx scripts/backfill-property-neighborhood-manual.ts --exec   # 写入
 *
 * 只更新 area 为空的楼盘；已设过 area 的不会被覆盖。
 * 原则：
 *   - 只列当前有把握的（楼盘名 + 地址双因子定位到确定小区）。
 *   - 不确定的（比如 "240 3rd Ave" 可能 Manhattan 也可能 Bronx）不列，留空给人工。
 *   - 非 NYC 五区的（Yonkers / New Rochelle / Parsippany / New Haven / Fairview NJ 等）
 *     也写入，只是值不在 AREA_MAP 里——前端按字符串原样显示。
 */
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"'))
      val = val.slice(1, -1).replace(/\\"/g, '"');
    process.env[key] = val;
  }
}
loadEnvLocal();

const EXEC = process.argv.includes("--exec");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * key = 楼盘 name（精确匹配）。值 = 目标 area。
 * 地址会被再校验一道作为双因子，防止重名覆盖错楼。
 */
const NAME_TO_AREA: Record<string, { area: string; addrContains: string }> = {
  // ──────── Queens / Astoria & LIC ────────
  "10 Halletts Point": { area: "Astoria", addrContains: "Halletts Point" },
  "20 Halletts Point": { area: "Astoria", addrContains: "Halletts Point" },
  "30 Halletts Point": { area: "Astoria", addrContains: "Halletts Point" },
  "Astor on Third":    { area: "Astoria", addrContains: "3rd St" },
  "Astor on Third II": { area: "Astoria", addrContains: "26th Ave" },

  // ──────── Queens / Forest Hills (104-XX Queens Blvd) ────────
  "Parker Towers (Bldg 1)": { area: "Forest Hills", addrContains: "104-20" },
  "Parker Towers (Bldg 2)": { area: "Forest Hills", addrContains: "104-40" },
  "Parker Towers (Bldg 3)": { area: "Forest Hills", addrContains: "104-60" },

  // ──────── Queens / Woodside (72-01 Queens Blvd) ────────
  "SOLA": { area: "Woodside", addrContains: "72-01 Queens" },

  // ──────── Brooklyn / Bushwick ────────
  "Denizen Bushwick (123 Melrose)": { area: "Bushwick", addrContains: "123 Melrose" },
  "Denizen Bushwick (54 Noll)":     { area: "Bushwick", addrContains: "54 Noll" },
  "The Rheingold":                  { area: "Bushwick", addrContains: "Montieth" },
  "115 Stanwix Street":             { area: "Bushwick", addrContains: "Stanwix" },

  // ──────── Brooklyn / Williamsburg ────────
  "1 North 4th Place": { area: "Williamsburg", addrContains: "North 4th" },

  // ──────── Brooklyn Heights / DUMBO ────────
  "Clover House":                         { area: "Brooklyn Heights", addrContains: "Columbia Heights" },
  "The Landing at Brooklyn Bridge Park":  { area: "DUMBO",            addrContains: "Bridge Park" },

  // ──────── Brooklyn / Fort Greene & Downtown Brooklyn ────────
  "240 Willoughby Street": { area: "Fort Greene",        addrContains: "Willoughby" },
  "89 DeKalb Avenue":      { area: "Fort Greene",        addrContains: "DeKalb" },
  "250 Ashland Place":     { area: "Fort Greene",        addrContains: "Ashland" },
  "Fulton Greene":         { area: "Fort Greene",        addrContains: "Fulton" },
  "388 Bridge Street":     { area: "Downtown Brooklyn",  addrContains: "Bridge St" },
  "Hub":                   { area: "Downtown Brooklyn",  addrContains: "Schermerhorn" },

  // ──────── Brooklyn / Boerum Hill, Prospect Heights ────────
  "One Boerum Place":        { area: "Boerum Hill",      addrContains: "Boerum" },
  "Brooklyn Crossing (PH)":  { area: "Prospect Heights", addrContains: "Sixth" },
  "461 Dean Street":         { area: "Prospect Heights", addrContains: "Dean" },

  // ──────── Brooklyn / Gowanus, Carroll Gardens, Park Slope ────────
  "251 Douglass Street":               { area: "Gowanus",         addrContains: "Douglass" },
  "363 Bond Street":                   { area: "Gowanus",         addrContains: "363 Bond" },
  "365 Bond Street":                   { area: "Gowanus",         addrContains: "365 Bond" },
  "541 Fourth Avenue":                 { area: "Park Slope",      addrContains: "4th Ave" },
  "420 Carroll Street":                { area: "Carroll Gardens", addrContains: "420 Carroll" },
  "544 Carroll Street":                { area: "Carroll Gardens", addrContains: "544 Carroll" },
  "499 President Street":              { area: "Carroll Gardens", addrContains: "President" },
  "Society Brooklyn at Sackett":       { area: "Carroll Gardens", addrContains: "Sackett" },
  "931 Carroll Street":                { area: "Crown Heights",   addrContains: "931 Carroll" },

  // ──────── Brooklyn / Flatbush ────────
  "Flatbush Gardens":      { area: "Flatbush", addrContains: "New York Ave" },
  "123 Linden Boulevard":  { area: "Flatbush", addrContains: "Linden" },

  // ──────── Manhattan ────────
  "Liberty Bay Club": { area: "Hells Kitchen", addrContains: "W 54th" },
  "Bay 151 (3 phases)": { area: "Chinatown",   addrContains: "Centre" },

  // ──────── Bronx ────────
  "Briar Hill":             { area: "Riverdale",  addrContains: "246th" },
  "The Century":            { area: "Riverdale",  addrContains: "Netherland" },
  "Lincoln at Bankside":    { area: "Mott Haven", addrContains: "Lincoln" },
  "Maven":                  { area: "Mott Haven", addrContains: "Third Ave" },
  "Third at Bankside":      { area: "Mott Haven", addrContains: "Third Ave" },

  // ──────── Staten Island ────────
  "Urby Staten Island": { area: "Stapleton", addrContains: "Navy Pier" },

  // ──────── NJ（AREA_MAP 内 "Other NJ" / Hoboken / Jersey City 都走小区名） ────────
  "Newark Urby":                    { area: "Newark",         addrContains: "Washington" },
  "ICONIQ 777 (Shaq Tower II)":     { area: "Newark",         addrContains: "McCarter" },
  "Colonnade Apartments":           { area: "Newark",         addrContains: "Clifton" },
  "The Capstone at Port Imperial":  { area: "West New York",  addrContains: "Port Imperial" },
  "RiverTrace at Port Imperial":    { area: "West New York",  addrContains: "Port Imperial" },
  "Meridia Park Avenue":            { area: "West New York",  addrContains: "6035 Park" },
  "The Rail at North Bergen":       { area: "North Bergen",   addrContains: "Tonnelle" },
  "5711 Kennedy":                   { area: "North Bergen",   addrContains: "Kennedy" },
  "Hudson Ridge Apartments":        { area: "North Bergen",   addrContains: "Blvd East" },
  "The Station":                    { area: "Union City",     addrContains: "Bergenline" },
  "Harbor Pointe":                  { area: "Bayonne",        addrContains: "Constitution" },
  "Hudson Mews":                    { area: "Secaucus",       addrContains: "Paterson Plank" },

  // ──────── NJ 不在 AREA_MAP 的城镇：按城镇原名入库 ────────
  "Harrison Yards (Ph I)": { area: "Harrison NJ",    addrContains: "Frank E Rodgers" },
  "500 PARQ":              { area: "Harrison NJ",    addrContains: "Parq" },
  "The Fairview":          { area: "Fairview NJ",    addrContains: "Bergen Blvd" },
  "The Meadowside":        { area: "Fairview NJ",    addrContains: "Bergen Blvd" },
  "Westminster Towers":    { area: "Elizabeth NJ",   addrContains: "N Broad" },
  "Avalon Parsippany":     { area: "Parsippany NJ",  addrContains: "Campus Dr" },
  "Halstead Parsippany":   { area: "Parsippany NJ",  addrContains: "US Route 46" },
  "GreyStar Properties":   { area: "Flemington NJ",  addrContains: "Flemington" },

  // ──────── NY 州外五区：Yonkers / New Rochelle ────────
  "Avalon Yonkers":              { area: "Yonkers",     addrContains: "Alexander" },
  "Alexander Crossing":          { area: "Yonkers",     addrContains: "Alexander" },
  "River Tides at Greystone":    { area: "Yonkers",     addrContains: "Warburton" },
  "Sawyer Place":                { area: "Yonkers",     addrContains: "Nepperhan" },
  "Stella":                      { area: "New Rochelle",addrContains: "LeCount" },

  // ──────── CT ────────
  "NEW HAVEN":  { area: "New Haven CT", addrContains: "New Haven" },
  "NEW HEAVEN": { area: "New Haven CT", addrContains: "New Haven" },

  // 剩下这些地址太模糊 / 没把握，脚本里显式忽略，留给人工：
  //   "Union Channel"     (240 3rd Ave 可能 Manhattan 也可能 Bronx)
  //   "Vinty"             (只有 "Union St" 无号段)
  //   "Hallmark House"    (10 Hill St 无城市)
  //   "Glenwood Apartments" (55 Glenwood Ave 无城市)
  //   "Cambridge Manor"   (539-571 N Broad St 无城市)
  //   "The Centre"        (1 Towne Centre Dr 无城市)
  //   "Vermella Broad Street" (355 Broad St 无城市)
  //   "Hudson Piers (6 bldgs)" (55 Riverside Dr 无城市)
  //   "Premiere Residences" (7 Livingston Ave 无城市)
};

async function main() {
  console.log(`Mode: ${EXEC ? "EXEC" : "dry-run"}`);
  const names = Object.keys(NAME_TO_AREA);
  const { data, error } = await db
    .from("properties")
    .select("id, name, address, area")
    .in("name", names);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    id: string;
    name: string | null;
    address: string | null;
    area: string | null;
  }[];

  const byName = new Map(rows.map((r) => [r.name ?? "", r]));

  type Plan = { id: string; name: string; address: string | null; from: string | null; to: string };
  const plans: Plan[] = [];
  const skipHasArea: string[] = [];
  const skipAddrMismatch: string[] = [];
  const missing: string[] = [];

  for (const [name, spec] of Object.entries(NAME_TO_AREA)) {
    const row = byName.get(name);
    if (!row) {
      missing.push(name);
      continue;
    }
    if (row.area && row.area.trim()) {
      skipHasArea.push(`${name} (已有 area="${row.area}")`);
      continue;
    }
    if (!row.address || !row.address.toLowerCase().includes(spec.addrContains.toLowerCase())) {
      skipAddrMismatch.push(`${name} (addr="${row.address}", 期望含 "${spec.addrContains}")`);
      continue;
    }
    plans.push({
      id: row.id,
      name,
      address: row.address,
      from: row.area,
      to: spec.area,
    });
  }

  console.log(`Matched in DB: ${Object.keys(NAME_TO_AREA).length - missing.length}`);
  console.log(`Will UPDATE: ${plans.length}`);
  if (skipHasArea.length) console.log(`SKIP (已有 area): ${skipHasArea.length}`);
  if (skipAddrMismatch.length) console.log(`SKIP (地址 mismatch): ${skipAddrMismatch.length}`);
  if (missing.length) console.log(`Name not found in DB: ${missing.length}`);

  console.log("\nPlans:");
  for (const p of plans) {
    console.log(`  ${p.name}  |  ${p.address}  →  ${p.to}`);
  }
  if (skipHasArea.length) {
    console.log("\nSkipped (已有 area):");
    for (const s of skipHasArea) console.log(`  ${s}`);
  }
  if (skipAddrMismatch.length) {
    console.log("\nSkipped (addr mismatch — 请核对):");
    for (const s of skipAddrMismatch) console.log(`  ${s}`);
  }
  if (missing.length) {
    console.log("\nName not in DB (可能改名了):");
    for (const s of missing) console.log(`  ${s}`);
  }

  if (!EXEC) {
    console.log("\ndry-run only; 加 --exec 写入。");
    return;
  }

  let ok = 0, fail = 0;
  for (const p of plans) {
    const { error } = await db.from("properties").update({ area: p.to }).eq("id", p.id);
    if (error) {
      fail += 1;
      console.error(`  FAIL ${p.name}: ${error.message}`);
    } else {
      ok += 1;
    }
  }
  console.log(`\nDone: ${ok} updated, ${fail} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
