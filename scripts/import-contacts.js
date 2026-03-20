/**
 * 一次性从项目根目录 contacts.csv 导入到 Supabase（逗号分隔，支持引号字段）
 * 正式导入：node scripts/import-contacts.js
 * 预览模式：node scripts/import-contacts.js --dry-run
 * 环境：.env.local 中的 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const DRY_RUN = process.argv.includes("--dry-run");

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

/** ILIKE 字面量：转义 % _ \ */
function escapeIlike(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** 解析单行 CSV（逗号分隔，双引号字段内可含逗号，"" 为转义引号） */
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

const CSV_PATH = path.resolve(process.cwd(), "contacts.csv");

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

/** 不区分大小写：按 email 查询已有联系人 id / name / title */
async function fetchExistingContactsByEmails(supabase, emailList) {
  /** @type {Map<string, { id: string, name: string | null, title: string | null, email: string | null }>} */
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
  if (!raw.trim()) {
    console.error("contacts.csv 是空的，请先填入数据（或从 exports/developers_properties_contacts.csv 复制）后再运行。");
    process.exit(1);
  }

  const { rows, headers } = parseCsv(raw);
  if (rows.length === 0) {
    console.error("contacts.csv 没有数据行：至少需要一行表头 + 一行数据。");
    process.exit(1);
  }

  const PROPERTY = "Property";
  const DEVELOPER = "Developer";
  const MKT_NAME = "Marketing/Leasing Contact";
  const MKT_TITLE = "Title";
  const MKT_EMAIL = "Email";
  const EXEC_NAME = "Executive Contact";
  const EXEC_TITLE = "Executive Title";
  const EXEC_EMAIL = "Executive Email";

  /** @type {{ property: string, developer: string, marketing: object, executive: object }[]} */
  const dataRows = [];
  for (const row of rows) {
    const property = (row[PROPERTY] || "").trim();
    if (!property) continue;
    dataRows.push({
      property,
      developer: (row[DEVELOPER] || "").trim(),
      marketing: {
        name: (row[MKT_NAME] || "").trim(),
        title: (row[MKT_TITLE] || "").trim(),
        email: (row[MKT_EMAIL] || "").trim(),
        is_primary: true,
      },
      executive: {
        name: (row[EXEC_NAME] || "").trim(),
        title: (row[EXEC_TITLE] || "").trim(),
        email: (row[EXEC_EMAIL] || "").trim(),
        is_primary: false,
      },
    });
  }

  const uniqueDevelopers = [...new Set(dataRows.map((r) => r.developer).filter(Boolean))];
  const uniqueProperties = [...new Set(dataRows.map((r) => r.property).filter(Boolean))];

  let newCompanies = 0;
  let newProperties = 0;
  let newLinks = 0;
  let newContacts = 0;
  let updatedContacts = 0;
  let skippedContacts = 0;

  /** @type {Map<string, string>} canonical developer string -> company uuid */
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

  /** @type {Map<string, string>} canonical property string -> property uuid */
  const propertyNameToId = new Map();

  for (const prop of uniqueProperties) {
    const existing = await findPropertyByNameIlike(supabase, prop);
    if (existing) {
      propertyNameToId.set(prop, existing.id);
      if (DRY_RUN) console.log(`[已存在楼盘] ${prop} → id: ${existing.id}`);
      continue;
    }
    if (DRY_RUN) {
      const fakeId = crypto.randomUUID();
      propertyNameToId.set(prop, fakeId);
      newProperties++;
      console.log(`[新建楼盘] ${prop}`);
    } else {
      const { data: inserted, error } = await supabase.from("properties").insert({ name: prop }).select("id").single();
      if (error) throw error;
      propertyNameToId.set(prop, inserted.id);
      newProperties++;
    }
  }

  // property_companies
  for (const r of dataRows) {
    if (!r.developer) continue;
    const companyId = developerToCompanyId.get(r.developer);
    const propertyId = propertyNameToId.get(r.property);
    if (!companyId || !propertyId) continue;

    const exists = await findPropertyCompany(supabase, propertyId, companyId, "developer");
    if (exists) continue;

    if (DRY_RUN) {
      newLinks++;
      console.log(`[新建关联] ${r.property} ↔ ${r.developer} (developer)`);
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

  // contacts：email 全局去重；库中已有且姓名为空则 UPDATE name/title；已有姓名则跳过
  const emailsToCheck = new Set();
  for (const r of dataRows) {
    if (!r.developer) continue;
    if (isValidEmail(r.marketing.email)) emailsToCheck.add(r.marketing.email.trim().toLowerCase());
    if (isValidEmail(r.executive.email)) emailsToCheck.add(r.executive.email.trim().toLowerCase());
  }
  const contactSnapshot = await fetchExistingContactsByEmails(supabase, [...emailsToCheck]);
  /** 本批已处理过的 email（INSERT / UPDATE / 跳过），避免 CSV 内重复行重复动作 */
  const handledEmailKeys = new Set();

  for (const r of dataRows) {
    if (!r.developer) continue;
    const companyId = developerToCompanyId.get(r.developer);
    if (!companyId) continue;

    const slots = [
      { ...r.marketing, kind: "marketing" },
      { ...r.executive, kind: "executive" },
    ];

    for (const slot of slots) {
      if (!isValidEmail(slot.email)) continue;
      const key = slot.email.trim().toLowerCase();
      if (handledEmailKeys.has(key)) {
        skippedContacts++;
        if (DRY_RUN) console.log(`[跳过联系人] 本批已处理 ${key}`);
        continue;
      }

      const contactName = slot.name || slot.email.split("@")[0] || "未命名";
      const titleVal = slot.title ? String(slot.title).trim() : null;

      const existingRow = contactSnapshot.get(key);
      if (!existingRow) {
        if (DRY_RUN) {
          newContacts++;
          console.log(`[新建联系人] ${contactName} (${slot.email.trim()}) → ${r.developer}`);
          contactSnapshot.set(key, {
            id: null,
            name: contactName,
            title: titleVal,
            email: slot.email.trim(),
          });
        } else {
          const { data: inserted, error } = await supabase
            .from("contacts")
            .insert({
              company_id: companyId,
              name: contactName,
              title: titleVal,
              email: slot.email.trim(),
              is_primary: slot.is_primary,
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
        const titleStr = titleVal || "—";
        if (DRY_RUN) {
          updatedContacts++;
          console.log(`[更新联系人] 补全 ${key} 的姓名：${contactName} (Title: ${titleStr})`);
          contactSnapshot.set(key, {
            ...existingRow,
            name: contactName,
            title: titleVal,
          });
        } else {
          const { error } = await supabase
            .from("contacts")
            .update({ name: contactName, title: titleVal })
            .eq("id", existingRow.id);
          if (error) throw error;
          updatedContacts++;
          contactSnapshot.set(key, {
            ...existingRow,
            name: contactName,
            title: titleVal,
          });
        }
        handledEmailKeys.add(key);
        continue;
      }

      skippedContacts++;
      if (DRY_RUN) console.log(`[跳过联系人] 已存在 ${key}`);
      handledEmailKeys.add(key);
    }
  }

  if (DRY_RUN) {
    console.log("");
    console.log("=== DRY RUN 预览 ===");
    console.log(`将新建公司 ${newCompanies} 个`);
    console.log(`将新建楼盘 ${newProperties} 个`);
    console.log(`将新建关联 ${newLinks} 条`);
    console.log(`将新建联系人 ${newContacts} 个`);
    console.log(`将更新联系人 ${updatedContacts} 个（补全姓名）`);
    console.log(`将跳过 ${skippedContacts} 个（已存在且姓名已填，或本批重复）`);
    console.log("");
    console.log("确认无误后运行：node scripts/import-contacts.js");
  } else {
    console.log(`新建公司 ${newCompanies} 个`);
    console.log(`新建楼盘 ${newProperties} 个`);
    console.log(`新建关联 ${newLinks} 条`);
    console.log(`新建联系人 ${newContacts} 个`);
    console.log(`更新联系人 ${updatedContacts} 个`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
