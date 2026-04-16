/**
 * 用 resolveArea(address) 回填 properties.area（= 前端的 Neighborhood 列）。
 *
 * 用法：
 *   npx tsx scripts/backfill-property-neighborhood.ts          # dry-run：只打印将要改什么
 *   npx tsx scripts/backfill-property-neighborhood.ts --exec   # 真的写库
 *   npx tsx scripts/backfill-property-neighborhood.ts --exec --overwrite
 *                                                             # 连已有 area 也用 resolver 覆盖
 *                                                             # （默认只补 area IS NULL/空字符串）
 *
 * 判定依据：
 *   1) 地址里的 5 位 ZIP → ZIP_TO_AREA
 *   2) 地址里的小区关键词 → AREA_MAP 正则
 * 两步都没命中时归为 "unresolved"，脚本不会乱猜，会单独列出来等人工确认。
 */
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolveArea } from "../src/lib/area-resolver";

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
loadEnvLocal();

const argv = new Set(process.argv.slice(2));
const EXEC = argv.has("--exec");
const OVERWRITE = argv.has("--overwrite");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("缺 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_ROLE);

type Row = {
  id: string;
  name: string | null;
  address: string | null;
  area: string | null;
};

function isEmptyArea(a: string | null): boolean {
  return !a || !a.trim();
}

async function loadAll(): Promise<Row[]> {
  const all: Row[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("properties")
      .select("id, name, address, area")
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as Row[];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return all;
}

async function main() {
  console.log(
    `Mode: ${EXEC ? "EXEC (will write)" : "dry-run"}${OVERWRITE ? " + OVERWRITE" : ""}`
  );
  const rows = await loadAll();
  console.log(`Loaded ${rows.length} properties`);

  const target = OVERWRITE ? rows : rows.filter((r) => isEmptyArea(r.area));
  console.log(`Candidates (${OVERWRITE ? "all rows" : "missing area"}): ${target.length}`);

  type Plan = {
    id: string;
    name: string | null;
    address: string | null;
    oldArea: string | null;
    newArea: string;
  };
  const plans: Plan[] = [];
  const unresolved: Row[] = [];
  const unchanged: Row[] = []; // OVERWRITE 时 resolver 给的和现有一致 → 不写

  for (const r of target) {
    const { area } = resolveArea(r.address);
    if (!area) {
      if (isEmptyArea(r.area)) unresolved.push(r);
      continue;
    }
    if ((r.area ?? "").trim() === area) {
      unchanged.push(r);
      continue;
    }
    plans.push({
      id: r.id,
      name: r.name,
      address: r.address,
      oldArea: r.area,
      newArea: area,
    });
  }

  console.log("");
  console.log(`Will UPDATE: ${plans.length}`);
  console.log(`Still UNRESOLVED (需要人工或补 ZIP 映射): ${unresolved.length}`);
  if (OVERWRITE) console.log(`Already correct: ${unchanged.length}`);

  // 按新 area 汇总预览
  const byArea = new Map<string, number>();
  for (const p of plans) byArea.set(p.newArea, (byArea.get(p.newArea) ?? 0) + 1);
  const byAreaSorted = [...byArea.entries()].sort((a, z) => z[1] - a[1]);
  console.log("");
  console.log("Top new neighborhoods (count):");
  for (const [a, c] of byAreaSorted.slice(0, 20)) {
    console.log(`  ${a.padEnd(28)} ${c}`);
  }

  console.log("");
  console.log("Sample plans (up to 15):");
  for (const p of plans.slice(0, 15)) {
    console.log(
      `  ${p.name ?? "—"}  |  ${p.address ?? "—"}  |  ${p.oldArea ?? "∅"} → ${p.newArea}`
    );
  }

  if (unresolved.length > 0) {
    console.log("");
    console.log("Unresolved samples (up to 30) — 地址没有 ZIP 且没命中小区关键词：");
    for (const r of unresolved.slice(0, 30)) {
      console.log(`  ${r.name ?? "—"}  |  ${r.address ?? "—"}`);
    }
  }

  if (!EXEC) {
    console.log("");
    console.log("dry-run only; 加 --exec 真的写入。");
    return;
  }

  // 批量 update，每条单独 where id = ... 保证只写 area 列
  const BATCH = 50;
  let done = 0;
  let failed = 0;
  for (let i = 0; i < plans.length; i += BATCH) {
    const batch = plans.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (p) => {
        const { error } = await db
          .from("properties")
          .update({ area: p.newArea })
          .eq("id", p.id);
        if (error) {
          failed += 1;
          console.error(`  FAIL ${p.id} (${p.name}): ${error.message}`);
        } else {
          done += 1;
        }
      })
    );
    console.log(`  ...${done + failed}/${plans.length}`);
  }
  console.log("");
  console.log(`Done: ${done} updated, ${failed} failed, ${unresolved.length} still unresolved.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
