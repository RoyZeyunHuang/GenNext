/**
 * 地址标准化脚本：补全/统一 properties.address 格式为 "street, city, state zip"
 * 同时更新 properties.city 字段为解析出的 city
 *
 *   node scripts/standardize-addresses.js          # dry-run
 *   node scripts/standardize-addresses.js --exec   # 执行
 */

const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

/* ─── env ─── */
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("未找到 .env.local");
    process.exit(1);
  }
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

/* ─── 完整地址覆写（4 个完全缺失 + name-only + 格式修正） ─── */
const ADDRESS_OVERWRITE = {
  // 4 completely missing
  "Kips Bay Court": "490 Second Avenue, New York, NY 10016",
  "StuyTown": "252 First Avenue, New York, NY 10009",
  "One Journal": "1 Journal Square Plaza, Jersey City, NJ 07306",
  "NEW HEAVEN": "19 Elm St, New Haven, CT 06510",

  // NYC — street only, need city/state/zip
  "2-20 Malt Drive": "2-20 Malt Drive, Long Island City, NY 11101",
  "4545 Center Blvd": "4545 Center Blvd, Long Island City, NY 11101",
  "Sunrose Tower": "620 W 153rd St, New York, NY 10031",
  "Sven": "29-59 Northern Blvd, Long Island City, NY 11101",
  "The Forge": "44-28 Purves St, Long Island City, NY 11101",
  "2 Royce Tower": "2 5th Ave, New York, NY 10003",
  "KK Empire": "8 Rich Ave, New York, NY 10012",
  "Royce Tower": "666 Royce Ave, New York, NY 10019",

  // Bayonne, NJ 07002
  "19 East": "19 E 19th St, Bayonne, NJ 07002",
  "Bayonne Bay": "500 Goldsborough Dr, Bayonne, NJ 07002",
  "Citizen Bayonne / The Breton": "155 Goldsborough Dr, Bayonne, NJ 07002",
  "EDGE Apartments": "222 Avenue F, Bayonne, NJ 07002",

  // West New York, NJ 07093
  "55 Riverwalk Place": "55 Riverwalk Pl, West New York, NJ 07093",
  "Riverbend 3 (RB3)": "30 Ave at Port Imperial, West New York, NJ 07093",
  "Riverbend at Port Imperial":
    "24 Ave at Port Imperial, West New York, NJ 07093",
  "RiverTrace": "11 Ave at Port Imperial, West New York, NJ 07093",
  "The Capstone": "17 Ave at Port Imperial, West New York, NJ 07093",
  "The Grand": "508 51st St, West New York, NJ 07093",
  "The Landings at Port Imperial":
    "4 Ave at Port Imperial, West New York, NJ 07093",

  // Weehawken, NJ 07086
  "Hamilton Cove": "800 Harbor Blvd, Weehawken, NJ 07086",
  "Harbor 1500": "1500 Harbor Blvd, Weehawken, NJ 07086",
  "Hoboken Point": "100 Harbor Blvd, Weehawken, NJ 07086",
  "RiverHouse 11": "1100 Ave at Port Imperial, Weehawken, NJ 07086",
  "RiverHouse 9": "900 Ave at Port Imperial, Weehawken, NJ 07086",
  "RiverParc": "1300 Avenue at Port Imperial, Weehawken, NJ 07086",
  "The Declan": "5 Port Imperial Blvd, Weehawken, NJ 07086",
  "The Estuary": "1600 Harbor Blvd, Weehawken, NJ 07086",
  "The Reserve at Estuary": "1525 Harbor Blvd, Weehawken, NJ 07086",

  // Fort Lee, NJ 07024
  "Hudson Lights": "2030 Hudson St, Fort Lee, NJ 07024",
  "The Modern Tower A & B": "800 Park Ave, Fort Lee, NJ 07024",
  "Twenty50": "2050 Central Rd, Fort Lee, NJ 07024",

  // North Bergen, NJ 07047
  "Avalon North Bergen": "5665 Kennedy Blvd, North Bergen, NJ 07047",
  "Solo at North Bergen": "4828 Tonnelle Ave, North Bergen, NJ 07047",
  "The Braddock": "8619 Bergenline Ave, North Bergen, NJ 07047",
  "The Duchess": "7601 River Rd, North Bergen, NJ 07047",
  "The Mews / Hudson Mews":
    "1305 Paterson Plank Rd, North Bergen, NJ 07047",

  // Secaucus, NJ 07094
  "Next at Xchange": "200 Riverside Station Blvd, Secaucus, NJ 07094",
  "Osprey Cove": "45 Meadowlands Pkwy, Secaucus, NJ 07094",
  "RVR at Xchange": "5000 Brianna Ln, Secaucus, NJ 07094",
  "The Harper at Harmon Meadow": "100 Park Plaza Dr, Secaucus, NJ 07094",

  // Edgewater, NJ 07020
  "The Alexander": "100 Alexander Way, Edgewater, NJ 07020",
  "The Oyster": "15 Somerset Ln, Edgewater, NJ 07020",
  "The View": "45 River Rd, Edgewater, NJ 07020",

  // Kearny, NJ 07032
  "Vermella Crossing": "302 Bergen Ave, Kearny, NJ 07032",
  "Vermella East": "60 Passaic Ave, Kearny, NJ 07032",
  "Vermella West": "135 Passaic Ave, Kearny, NJ 07032",

  // Jersey City — missing zip
  "Plaza 8": "242 Hudson St, Jersey City, NJ 07302",
};

/**
 * Parse city from standardized address "street, City, ST ZIP"
 * Returns city name or null.
 */
function parseCityFromAddress(address) {
  if (!address) return null;
  const m = address.match(/,\s*([^,]+?),\s*(?:NY|NJ|CT)\s+\d{5}/);
  if (m) return m[1].trim();
  const m2 = address.match(/,\s*([^,]+?),\s*(?:NY|NJ|CT)\s*$/);
  if (m2) return m2[1].trim();
  return null;
}

async function main() {
  const exec = process.argv.includes("--exec");
  loadEnvLocal();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: properties, error } = await supabase
    .from("properties")
    .select("id, name, address, city, area")
    .order("name");

  if (error) {
    console.error(error);
    process.exit(1);
  }

  const addrUpdates = [];
  const cityUpdates = [];

  for (const p of properties) {
    const overwrite = ADDRESS_OVERWRITE[p.name];
    const currentAddr = (p.address || "").trim();

    if (overwrite && currentAddr !== overwrite) {
      const city = parseCityFromAddress(overwrite);
      addrUpdates.push({
        id: p.id,
        name: p.name,
        oldAddr: currentAddr || "(empty)",
        newAddr: overwrite,
        oldCity: p.city,
        city: city || p.city,
        reason: currentAddr ? "incomplete → standardized" : "missing → added",
      });
    } else {
      const addr = overwrite || currentAddr;
      if (!addr) continue;
      const hasStateZip = /,\s*(?:NY|NJ|CT)\s+\d{5}/.test(addr);
      if (!hasStateZip) {
        console.warn(
          `⚠️  ${p.name}: no state/zip "${addr}" — NOT in overwrite map`
        );
        continue;
      }
      const parsed = parseCityFromAddress(addr);
      if (parsed && parsed !== p.city) {
        cityUpdates.push({
          id: p.id,
          name: p.name,
          oldCity: p.city,
          city: parsed,
        });
      }
    }
  }

  console.log(`\n共 ${properties.length} 个楼盘`);
  console.log(`  地址更新: ${addrUpdates.length} 个`);
  console.log(`  city 修正: ${cityUpdates.length} 个\n`);

  if (addrUpdates.length) {
    console.log("═══ 地址更新 ═══");
    for (const u of addrUpdates) {
      console.log(
        `  ${u.name}  [${u.reason}]\n    addr: ${u.oldAddr} → ${u.newAddr}\n    city: ${u.oldCity} → ${u.city}\n`
      );
    }
  }
  if (cityUpdates.length) {
    console.log("═══ City 修正 ═══");
    for (const u of cityUpdates) {
      console.log(`  ${u.name}: ${u.oldCity} → ${u.city}`);
    }
    console.log();
  }

  if (!exec) {
    console.log("--- DRY RUN 完成，加 --exec 参数执行写入 ---");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const u of addrUpdates) {
    const { error: ue } = await supabase
      .from("properties")
      .update({ address: u.newAddr, city: u.city })
      .eq("id", u.id);
    if (ue) {
      console.error(`❌ ${u.name}: ${ue.message}`);
      fail++;
    } else {
      ok++;
    }
  }
  for (const u of cityUpdates) {
    const { error: ue } = await supabase
      .from("properties")
      .update({ city: u.city })
      .eq("id", u.id);
    if (ue) {
      console.error(`❌ ${u.name}: ${ue.message}`);
      fail++;
    } else {
      ok++;
    }
  }
  console.log(
    `\n✅ 更新成功 ${ok} / ${addrUpdates.length + cityUpdates.length} 个，失败 ${fail} 个`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
