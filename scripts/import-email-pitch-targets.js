/**
 * 从 research/email_pitch_targets.xlsx 导入 CRM
 * （楼盘 + 开发商公司 + 关联 + 联系人）
 *
 * 预览：node scripts/import-email-pitch-targets.js --dry-run
 * 执行：node scripts/import-email-pitch-targets.js
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");

const DRY_RUN = process.argv.includes("--dry-run");
const XLSX_PATH = path.resolve(process.cwd(), "research/email_pitch_targets.xlsx");

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("未找到 .env.local，请在项目根目录运行");
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    process.env[key] = val;
  }
}

function escapeIlike(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function isValidEmail(email) {
  const e = String(email || "").trim();
  return e.length > 3 && e.includes("@") && !e.includes(" ") && !e.endsWith("domain");
}

function parseBuildYear(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1800 || n > 2100) return null;
  return n;
}

function parseUnits(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1 || n > 100000) return null;
  return n;
}

function parseAddress(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { fullAddress: null, city: null };
  const parts = s.split(",").map((p) => p.trim());
  let city = null;
  if (parts.length >= 2) {
    const second = parts[parts.length - 2] || "";
    if (second && !/^\d/.test(second) && !second.includes("NJ") && !second.includes("NY")) {
      city = second;
    }
    const stateCity = parts.slice(1).join(", ");
    if (/Brooklyn/i.test(stateCity)) city = "Brooklyn";
    else if (/Newark/i.test(stateCity)) city = "Newark";
    else if (/West New York/i.test(stateCity)) city = "West New York";
    else if (/Jersey City/i.test(stateCity)) city = "Jersey City";
  }
  return { fullAddress: s, city };
}

async function findCompanyByNameIlike(supabase, name) {
  const pattern = escapeIlike(name.trim());
  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .ilike("name", pattern)
    .limit(1);
  if (error) throw error;
  return data && data.length ? data[0] : null;
}

async function findPropertyByNameIlike(supabase, name) {
  const pattern = escapeIlike(name.trim());
  const { data, error } = await supabase
    .from("properties")
    .select("id, name, build_year, units")
    .ilike("name", pattern)
    .limit(1);
  if (error) throw error;
  return data && data.length ? data[0] : null;
}

async function fetchExistingContactsByEmails(supabase, emailList) {
  const map = new Map();
  for (const em of emailList) {
    const pattern = escapeIlike(em.trim());
    const { data, error } = await supabase
      .from("contacts")
      .select("id, name, title, email")
      .ilike("email", pattern)
      .limit(1);
    if (error) throw error;
    if (data && data.length) map.set(em.trim().toLowerCase(), data[0]);
  }
  return map;
}

async function findPropertyCompany(supabase, propertyId, companyId, role) {
  const { data, error } = await supabase
    .from("property_companies")
    .select("id")
    .eq("property_id", propertyId)
    .eq("company_id", companyId)
    .eq("role", role)
    .limit(1);
  if (error) throw error;
  return data && data.length ? data[0] : null;
}

async function main() {
  loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("请在 .env.local 中配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  if (!fs.existsSync(XLSX_PATH)) {
    console.error("未找到文件:", XLSX_PATH);
    process.exit(1);
  }

  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  console.log(`读取 ${rows.length} 行数据\n`);

  // 预处理：按楼盘聚合 build_year / units / address
  const buildingMeta = new Map();
  for (const row of rows) {
    const building = String(row.property_name || "").trim();
    if (!building) continue;
    const { fullAddress, city } = parseAddress(row.address);
    const by = parseBuildYear(row.build_year);
    const u = parseUnits(row.units);
    const prev = buildingMeta.get(building);
    if (!prev) {
      buildingMeta.set(building, { fullAddress, city, buildYear: by, units: u });
    } else {
      if (by != null && prev.buildYear == null) prev.buildYear = by;
      if (u != null && prev.units == null) prev.units = u;
      if (fullAddress && !prev.fullAddress) prev.fullAddress = fullAddress;
      if (city && !prev.city) prev.city = city;
    }
  }

  // 筛选有效行（有合法 email + 有 developer）
  const dataRows = [];
  let skippedNoEmail = 0;
  for (const row of rows) {
    const building = String(row.property_name || "").trim();
    const developer = String(row.developer_company || "").trim();
    const contactName = String(row.contact_name || "").trim();
    const title = String(row.contact_title || "").trim();
    const email = String(row.contact_email || "").trim();
    const confidence = String(row.email_confidence || "").trim();

    if (!building) continue;
    if (!developer) { skippedNoEmail++; continue; }
    if (!isValidEmail(email)) { skippedNoEmail++; continue; }

    const { fullAddress, city } = parseAddress(row.address);
    dataRows.push({ building, fullAddress, city, developer, contactName, title: title || null, email, confidence });
  }

  console.log(`有效导入行: ${dataRows.length}，跳过（无 email 或无开发商）: ${skippedNoEmail}\n`);

  const uniqueDevelopers = [...new Set(dataRows.map((r) => r.developer))];
  const uniqueBuildings = [...new Set(dataRows.map((r) => r.building))];

  let newCompanies = 0, newProperties = 0, updatedPropertyMeta = 0;
  let newLinks = 0, newContacts = 0, updatedContacts = 0, skippedContacts = 0;

  // === 公司 ===
  const developerToCompanyId = new Map();
  for (const dev of uniqueDevelopers) {
    const existing = await findCompanyByNameIlike(supabase, dev);
    if (existing) {
      developerToCompanyId.set(dev, existing.id);
      if (DRY_RUN) console.log(`[已存在公司] ${existing.name} → id: ${existing.id}`);
      continue;
    }
    if (DRY_RUN) {
      developerToCompanyId.set(dev, crypto.randomUUID());
      newCompanies++;
      console.log(`[新建公司] ${dev} (type: developer)`);
    } else {
      const { data: inserted, error } = await supabase
        .from("companies")
        .insert({ name: dev, type: "developer" })
        .select("id")
        .single();
      if (error) throw error;
      developerToCompanyId.set(dev, inserted.id);
      newCompanies++;
    }
  }

  // === 楼盘 ===
  const propertyNameToId = new Map();
  for (const building of uniqueBuildings) {
    const meta = buildingMeta.get(building) || { fullAddress: null, city: null, buildYear: null, units: null };

    const existing = await findPropertyByNameIlike(supabase, building);
    if (existing) {
      propertyNameToId.set(building, existing.id);
      const patch = {};
      if (meta.buildYear != null && existing.build_year == null) patch.build_year = meta.buildYear;
      if (meta.units != null && existing.units == null) patch.units = meta.units;
      if (Object.keys(patch).length > 0) {
        if (DRY_RUN) {
          updatedPropertyMeta++;
          console.log(`[更新楼盘] ${building} → ${JSON.stringify(patch)}`);
        } else {
          const { error } = await supabase.from("properties").update(patch).eq("id", existing.id);
          if (error) throw error;
          updatedPropertyMeta++;
        }
      } else if (DRY_RUN) {
        console.log(`[已存在楼盘] ${building} → id: ${existing.id}`);
      }
      continue;
    }

    if (DRY_RUN) {
      propertyNameToId.set(building, crypto.randomUUID());
      newProperties++;
      console.log(`[新建楼盘] ${building} | 地址: ${meta.fullAddress || "—"} | build_year: ${meta.buildYear ?? "—"} | units: ${meta.units ?? "—"}`);
    } else {
      const { data: inserted, error } = await supabase
        .from("properties")
        .insert({
          name: building,
          address: meta.fullAddress || null,
          city: meta.city || null,
          build_year: meta.buildYear,
          units: meta.units,
        })
        .select("id")
        .single();
      if (error) throw error;
      propertyNameToId.set(building, inserted.id);
      newProperties++;
    }
  }

  // === 楼盘-开发商关联 ===
  const linkPairSeen = new Set();
  for (const r of dataRows) {
    const companyId = developerToCompanyId.get(r.developer);
    const propertyId = propertyNameToId.get(r.building);
    if (!companyId || !propertyId) continue;

    const pairKey = `${propertyId}|${companyId}`;
    if (linkPairSeen.has(pairKey)) continue;

    if (!DRY_RUN) {
      const exists = await findPropertyCompany(supabase, propertyId, companyId, "developer");
      if (exists) { linkPairSeen.add(pairKey); continue; }
    }

    linkPairSeen.add(pairKey);
    if (DRY_RUN) {
      newLinks++;
      console.log(`[新建关联] ${r.building} ↔ ${r.developer} (developer)`);
    } else {
      const { error } = await supabase.from("property_companies").insert({
        property_id: propertyId,
        company_id: companyId,
        role: "developer",
      });
      if (error) throw error;
      newLinks++;
    }
  }

  // === 联系人 ===
  const emailsToCheck = new Set(dataRows.map((r) => r.email.trim().toLowerCase()));
  const contactSnapshot = await fetchExistingContactsByEmails(supabase, [...emailsToCheck]);
  const handledEmailKeys = new Set();

  for (const r of dataRows) {
    const companyId = developerToCompanyId.get(r.developer);
    if (!companyId) continue;

    const key = r.email.trim().toLowerCase();
    if (handledEmailKeys.has(key)) { skippedContacts++; continue; }

    const name = r.contactName || r.email.split("@")[0] || "未命名";
    const existingRow = contactSnapshot.get(key);

    if (!existingRow) {
      if (DRY_RUN) {
        newContacts++;
        console.log(`[新建联系人] ${name} | ${r.email} | ${r.title || "—"} | ${r.confidence} | ${r.developer}`);
        contactSnapshot.set(key, { id: null, name, title: r.title, email: r.email.trim() });
      } else {
        const { data: inserted, error } = await supabase
          .from("contacts")
          .insert({ company_id: companyId, name, title: r.title, email: r.email.trim(), is_primary: true })
          .select("id, name, title, email")
          .single();
        if (error) throw error;
        newContacts++;
        if (inserted) contactSnapshot.set(key, inserted);
      }
      handledEmailKeys.add(key);
      continue;
    }

    const nameEmpty = !existingRow.name || !String(existingRow.name).trim();
    if (nameEmpty) {
      if (DRY_RUN) {
        updatedContacts++;
        console.log(`[更新联系人] 补全 ${key} → 姓名: ${name}, Title: ${r.title || "—"}`);
      } else {
        const { error } = await supabase.from("contacts").update({ name, title: r.title }).eq("id", existingRow.id);
        if (error) throw error;
        updatedContacts++;
      }
      handledEmailKeys.add(key);
      continue;
    }

    skippedContacts++;
    if (DRY_RUN) console.log(`[跳过联系人] 已存在 ${key} (${existingRow.name})`);
    handledEmailKeys.add(key);
  }

  console.log("\n=== 汇总 ===");
  const prefix = DRY_RUN ? "将" : "已";
  console.log(`${prefix}新建公司 ${newCompanies} 个`);
  console.log(`${prefix}新建楼盘 ${newProperties} 个`);
  console.log(`${prefix}更新楼盘（build_year/units）${updatedPropertyMeta} 个`);
  console.log(`${prefix}新建楼盘-开发商关联 ${newLinks} 条`);
  console.log(`${prefix}新建联系人 ${newContacts} 个`);
  console.log(`${prefix}更新联系人 ${updatedContacts} 个`);
  console.log(`跳过联系人 ${skippedContacts} 个（重复 email 或已存在）`);
  console.log(`跳过无效行 ${skippedNoEmail} 个（无 email / 无开发商 / 仅域名提示）`);

  if (DRY_RUN) {
    console.log("\n确认后执行：node scripts/import-email-pitch-targets.js");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
