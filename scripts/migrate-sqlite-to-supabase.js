/**
 * 将 SQLite bd_system.db 数据迁移到 Supabase
 * 使用方式：node scripts/migrate-sqlite-to-supabase.js
 * 环境变量：从 .env.local 读取 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const Database = require("better-sqlite3");
const crypto = require("crypto");

// 从 .env.local 加载环境变量
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("未找到 .env.local，请确保在项目根目录运行");
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

function toIsoIfNeeded(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}\s/.test(s)) return s.replace(" ", "T") + "Z";
  return s;
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("请在 .env.local 中配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const sqlitePath = path.resolve(process.cwd(), "import", "bd_system.db");
if (!fs.existsSync(sqlitePath)) {
  console.error("未找到 SQLite 文件:", sqlitePath);
  process.exit(1);
}

const db = new Database(sqlitePath, { readonly: true });
const supabase = createClient(supabaseUrl, supabaseKey);

const companyIdMap = new Map(); // old id (number) -> new uuid
const propertyIdMap = new Map(); // old id (number) -> new uuid

async function main() {
  let companiesCount = 0;
  let contactsCount = 0;
  let propertiesCount = 0;
  let propertyCompaniesCount = 0;
  let outreachCount = 0;

  try {
    // 1. companies
    const companies = db.prepare("SELECT id, name, type, phone, email, website, created_at, updated_at FROM companies").all();
    for (const row of companies) {
      const newId = crypto.randomUUID();
      companyIdMap.set(row.id, newId);
      const { error } = await supabase.from("companies").insert({
        id: newId,
        name: row.name ?? "",
        type: row.type ?? null,
        phone: row.phone ?? null,
        email: row.email ?? null,
        website: row.website ?? null,
        created_at: toIsoIfNeeded(row.created_at),
        updated_at: toIsoIfNeeded(row.updated_at),
      });
      if (error) {
        console.error("companies 插入失败:", row.id, error.message);
        throw error;
      }
      companiesCount++;
    }
    console.log("companies 迁移完成:", companiesCount, "条");

    // 2. contacts
    const contacts = db.prepare("SELECT company_id, name, title, phone, email, linkedin_url, is_primary, created_at FROM contacts").all();
    for (const row of contacts) {
      const newCompanyId = companyIdMap.get(row.company_id);
      if (!newCompanyId) {
        console.warn("contacts 跳过：未找到 company_id 映射", row.company_id);
        continue;
      }
      const { error } = await supabase.from("contacts").insert({
        company_id: newCompanyId,
        name: row.name ?? "",
        title: row.title ?? null,
        phone: row.phone ?? null,
        email: row.email ?? null,
        linkedin_url: row.linkedin_url ?? null,
        is_primary: !!(row.is_primary === 1 || row.is_primary === true),
        created_at: toIsoIfNeeded(row.created_at),
      });
      if (error) {
        console.error("contacts 插入失败:", row.name, error.message);
        throw error;
      }
      contactsCount++;
    }
    console.log("contacts 迁移完成:", contactsCount, "条");

    // 3. properties
    const properties = db.prepare("SELECT id, name, address, city, area, price_range, units, build_year, created_at, updated_at FROM properties").all();
    for (const row of properties) {
      const newId = crypto.randomUUID();
      propertyIdMap.set(row.id, newId);
      const { error } = await supabase.from("properties").insert({
        id: newId,
        name: row.name ?? "",
        address: row.address ?? null,
        city: row.city ?? "New York",
        area: row.area ?? null,
        price_range: row.price_range ?? null,
        units: row.units ?? null,
        build_year: row.build_year ?? null,
        created_at: toIsoIfNeeded(row.created_at),
        updated_at: toIsoIfNeeded(row.updated_at),
      });
      if (error) {
        console.error("properties 插入失败:", row.id, error.message);
        throw error;
      }
      propertiesCount++;
    }
    console.log("properties 迁移完成:", propertiesCount, "条");

    // 4. property_companies
    const propertyCompanies = db.prepare("SELECT property_id, company_id, role FROM property_companies").all();
    for (const row of propertyCompanies) {
      const newPropertyId = propertyIdMap.get(row.property_id);
      const newCompanyId = companyIdMap.get(row.company_id);
      if (!newPropertyId || !newCompanyId) {
        console.warn("property_companies 跳过：未找到映射", row.property_id, row.company_id);
        continue;
      }
      const { error } = await supabase.from("property_companies").insert({
        property_id: newPropertyId,
        company_id: newCompanyId,
        role: row.role ?? "",
      });
      if (error) {
        console.error("property_companies 插入失败:", error.message);
        throw error;
      }
      propertyCompaniesCount++;
    }
    console.log("property_companies 迁移完成:", propertyCompaniesCount, "条");

    // 5. outreach
    const outreachRows = db.prepare("SELECT property_id, status, contact_name, contact_info, notes, created_at, updated_at FROM outreach").all();
    for (const row of outreachRows) {
      const newPropertyId = propertyIdMap.get(row.property_id);
      if (!newPropertyId) {
        console.warn("outreach 跳过：未找到 property_id 映射", row.property_id);
        continue;
      }
      const { error } = await supabase.from("outreach").insert({
        property_id: newPropertyId,
        status: row.status ?? "Not Started",
        contact_name: row.contact_name ?? null,
        contact_info: row.contact_info ?? null,
        notes: row.notes ?? null,
        created_at: toIsoIfNeeded(row.created_at),
        updated_at: toIsoIfNeeded(row.updated_at),
      });
      if (error) {
        console.error("outreach 插入失败:", error.message);
        throw error;
      }
      outreachCount++;
    }
    console.log("outreach 迁移完成:", outreachCount, "条");
  } finally {
    db.close();
  }

  console.log("\n========== 迁移汇总 ==========");
  console.log("companies:       ", companiesCount, "条");
  console.log("contacts:       ", contactsCount, "条");
  console.log("properties:     ", propertiesCount, "条");
  console.log("property_companies:", propertyCompaniesCount, "条");
  console.log("outreach:       ", outreachCount, "条");
  console.log("==============================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
