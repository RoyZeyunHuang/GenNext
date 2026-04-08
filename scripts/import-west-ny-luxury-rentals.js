/**
 * 从 west_ny_luxury_rentals_contacts_v2.csv 导入 CRM（楼盘 + 开发商公司 + 关联 + 联系人）
 * 字段：楼盘名、地址、build_year、units、开发商、联系人姓名、title、email
 *
 * 预览：node scripts/import-west-ny-luxury-rentals.js --dry-run
 * 执行：node scripts/import-west-ny-luxury-rentals.js
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const DRY_RUN = process.argv.includes("--dry-run");
const CSV_PATH = path.resolve(process.cwd(), "west_ny_luxury_rentals_contacts_v2.csv");

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
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1).replace(/\\'/g, "'");
    process.env[key] = val;
  }
}

function escapeIlike(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function parseCsv(content) {
  const text = content.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((ln, idx) => idx === 0 || ln.length > 0);
  if (lines.length === 0 || !lines[0].trim()) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cells = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] != null ? String(cells[idx]).trim() : "";
    });
    rows.push(obj);
  }
  return { headers, rows };
}

function isValidEmail(email) {
  const e = String(email || "").trim();
  return e.length > 0 && e.includes("@");
}

function isSkippedDeveloper(dev) {
  const d = String(dev || "").trim();
  if (!d) return true;
  if (/^unknown\b/i.test(d)) return true;
  return false;
}

/** @returns {number | null} */
function parseBuildYear(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1800 || n > 2100) return null;
  return n;
}

/** @returns {number | null} */
function parseUnits(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1 || n > 100000) return null;
  return n;
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
    .select("id, name")
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

function isContactNameEmpty(name) {
  return name == null || !String(name).trim();
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

  if (!fs.existsSync(CSV_PATH)) {
    console.error("未找到文件:", CSV_PATH);
    process.exit(1);
  }

  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const { rows } = parseCsv(raw);

  /** 全表合并：地址、建成年份、单元数（任一行有即采用） */
  /** @type {Map<string, { fullAddress: string, city: string | null, buildYear: number | null, units: number | null }>} */
  const buildingMeta = new Map();
  for (const row of rows) {
    const building = (row.building_name || "").trim();
    if (!building) continue;
    const street = (row.address || "").trim();
    const city = (row.city || "").trim();
    const state = (row.state || "").trim();
    const fullAddress = [street, city, state].filter(Boolean).join(", ");
    const by = parseBuildYear(row.build_year);
    const u = parseUnits(row.units);
    const prev = buildingMeta.get(building);
    if (!prev) {
      buildingMeta.set(building, {
        fullAddress,
        city: city || null,
        buildYear: by,
        units: u,
      });
    } else {
      if (by != null && prev.buildYear == null) prev.buildYear = by;
      if (u != null && prev.units == null) prev.units = u;
      if (fullAddress && !prev.fullAddress) prev.fullAddress = fullAddress;
      if (city && !prev.city) prev.city = city;
    }
  }

  /** @type {{ building: string, fullAddress: string, city: string | null, developer: string, contactName: string, title: string | null, email: string }[]} */
  const dataRows = [];
  for (const row of rows) {
    const building = (row.building_name || "").trim();
    const street = (row.address || "").trim();
    const city = (row.city || "").trim();
    const state = (row.state || "").trim();
    const developer = (row.developer_owner || "").trim();
    const contactName = (row.contact_name || "").trim();
    const title = (row.contact_title || "").trim();
    const email = (row.contact_email || "").trim();

    if (!building) continue;
    if (!isValidEmail(email)) continue;
    if (isSkippedDeveloper(developer)) continue;

    const fullAddress = [street, city, state].filter(Boolean).join(", ");
    dataRows.push({
      building,
      fullAddress,
      city: city || null,
      developer,
      contactName,
      title: title || null,
      email,
    });
  }

  const uniqueDevelopers = [...new Set(dataRows.map((r) => r.developer))];
  const uniqueBuildingNames = [...new Set(dataRows.map((r) => r.building))];

  let newCompanies = 0;
  let newProperties = 0;
  let updatedPropertyMeta = 0;
  let newLinks = 0;
  let newContacts = 0;
  let updatedContacts = 0;
  let skippedContacts = 0;

  const developerToCompanyId = new Map();

  for (const dev of uniqueDevelopers) {
    const existing = await findCompanyByNameIlike(supabase, dev);
    if (existing) {
      developerToCompanyId.set(dev, existing.id);
      if (DRY_RUN) console.log(`[已存在公司] ${existing.name} → id: ${existing.id}`);
      continue;
    }
    if (DRY_RUN) {
      const fakeId = crypto.randomUUID();
      developerToCompanyId.set(dev, fakeId);
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

  const propertyNameToId = new Map();

  for (const building of uniqueBuildingNames) {
    const meta = buildingMeta.get(building) || {
      fullAddress: "",
      city: null,
      buildYear: null,
      units: null,
    };
    const { fullAddress, city, buildYear, units } = meta;

    const existing = await findPropertyByNameIlike(supabase, building);
    if (existing) {
      propertyNameToId.set(building, existing.id);
      /** @type {{ build_year?: number, units?: number }} */
      const patch = {};
      if (buildYear != null) patch.build_year = buildYear;
      if (units != null) patch.units = units;
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
      const fakeId = crypto.randomUUID();
      propertyNameToId.set(building, fakeId);
      newProperties++;
      const y = buildYear != null ? String(buildYear) : "—";
      const un = units != null ? String(units) : "—";
      console.log(`[新建楼盘] ${building} | 地址: ${fullAddress || "—"} | build_year: ${y} | units: ${un}`);
    } else {
      const { data: inserted, error } = await supabase
        .from("properties")
        .insert({
          name: building,
          address: fullAddress || null,
          city: city || "New York",
          build_year: buildYear,
          units,
        })
        .select("id")
        .single();
      if (error) throw error;
      propertyNameToId.set(building, inserted.id);
      newProperties++;
    }
  }

  /** 同一楼盘+开发商在 CSV 多行只建一条关联；dry-run 下不能用假 UUID 查库，靠本 Set 去重 */
  const linkPairSeen = new Set();

  for (const r of dataRows) {
    const companyId = developerToCompanyId.get(r.developer);
    const propertyId = propertyNameToId.get(r.building);
    if (!companyId || !propertyId) continue;

    const pairKey = `${propertyId}|${companyId}`;
    if (linkPairSeen.has(pairKey)) continue;

    if (!DRY_RUN) {
      const exists = await findPropertyCompany(supabase, propertyId, companyId, "developer");
      if (exists) {
        linkPairSeen.add(pairKey);
        continue;
      }
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

  const emailsToCheck = new Set(dataRows.map((r) => r.email.trim().toLowerCase()));
  const contactSnapshot = await fetchExistingContactsByEmails(supabase, [...emailsToCheck]);
  const handledEmailKeys = new Set();

  for (const r of dataRows) {
    const companyId = developerToCompanyId.get(r.developer);
    if (!companyId) continue;

    const key = r.email.trim().toLowerCase();
    if (handledEmailKeys.has(key)) {
      skippedContacts++;
      if (DRY_RUN) console.log(`[跳过联系人] 本批已处理 ${key}`);
      continue;
    }

    const name = r.contactName || r.email.split("@")[0] || "未命名";
    const titleVal = r.title;

    const existingRow = contactSnapshot.get(key);
    if (!existingRow) {
      if (DRY_RUN) {
        newContacts++;
        console.log(
          `[新建联系人] ${name} | ${r.email} | ${titleVal || "—"} | 开发商: ${r.developer} | 楼盘: ${r.building}`
        );
        contactSnapshot.set(key, { id: null, name, title: titleVal, email: r.email.trim() });
      } else {
        const { data: inserted, error } = await supabase
          .from("contacts")
          .insert({
            company_id: companyId,
            name,
            title: titleVal,
            email: r.email.trim(),
            is_primary: true,
          })
          .select("id, name, title, email")
          .single();
        if (error) throw error;
        newContacts++;
        if (inserted) contactSnapshot.set(key, inserted);
      }
      handledEmailKeys.add(key);
      continue;
    }

    if (isContactNameEmpty(existingRow.name)) {
      if (DRY_RUN) {
        updatedContacts++;
        console.log(`[更新联系人] 补全 ${key} → 姓名: ${name}, Title: ${titleVal || "—"}`);
        contactSnapshot.set(key, { ...existingRow, name, title: titleVal });
      } else {
        const { error } = await supabase
          .from("contacts")
          .update({ name, title: titleVal })
          .eq("id", existingRow.id);
        if (error) throw error;
        updatedContacts++;
        contactSnapshot.set(key, { ...existingRow, name, title: titleVal });
      }
      handledEmailKeys.add(key);
      continue;
    }

    skippedContacts++;
    if (DRY_RUN) console.log(`[跳过联系人] 已存在 ${key}`);
    handledEmailKeys.add(key);
  }

  console.log("");
  console.log("=== 将写入的字段（每条联系人行）===");
  console.log(
    "楼盘名(properties.name) | 地址 + build_year + units | 开发商(companies) | 联系人(contacts.name/title/email)"
  );
  console.log("");
  if (DRY_RUN) {
    console.log("=== DRY RUN 汇总 ===");
    console.log(`将新建公司 ${newCompanies} 个`);
    console.log(`将新建楼盘 ${newProperties} 个`);
    console.log(`将更新楼盘（build_year / units）${updatedPropertyMeta} 个（已存在楼盘）`);
    console.log(`将新建楼盘-开发商关联 ${newLinks} 条`);
    console.log(`将新建联系人 ${newContacts} 个`);
    console.log(`将更新联系人 ${updatedContacts} 个（库中同名空则补全）`);
    console.log(`将跳过 ${skippedContacts} 个联系人动作（本批重复 email 或库中已有且姓名已填）`);
    console.log("");
    console.log("确认后执行：node scripts/import-west-ny-luxury-rentals.js");
  } else {
    console.log(`新建公司 ${newCompanies} 个`);
    console.log(`新建楼盘 ${newProperties} 个`);
    console.log(`更新楼盘（build_year / units）${updatedPropertyMeta} 个`);
    console.log(`新建关联 ${newLinks} 条`);
    console.log(`新建联系人 ${newContacts} 个`);
    console.log(`更新联系人 ${updatedContacts} 个`);
    console.log(`跳过 ${skippedContacts} 个`);
  }

  const skippedNoEmail = rows.filter((row) => {
    const b = (row.building_name || "").trim();
    const e = (row.contact_email || "").trim();
    const d = (row.developer_owner || "").trim();
    return b && (!isValidEmail(e) || isSkippedDeveloper(d));
  }).length;
  console.log("");
  console.log(`CSV 中因无有效 email 或开发商为 Unknown 而未导入的联系人行数: ${skippedNoEmail}（楼盘仍可在有联系人的行中创建）`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
