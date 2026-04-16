/**
 * 列出所有 area 仍为空、且 resolveArea 也无法从地址识别的楼盘。
 *   npx tsx scripts/list-properties-missing-area.ts
 */
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolveArea } from "../src/lib/area-resolver";

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

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const all: { id: string; name: string | null; address: string | null; area: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("properties")
      .select("id, name, address, area")
      .order("name")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const missing = all.filter((r) => !r.area || !r.area.trim());
  const unresolved = missing.filter((r) => !resolveArea(r.address).area);
  console.log(`Total ${all.length}, missing area ${missing.length}, still unresolved ${unresolved.length}`);
  console.log("");
  console.log("name\taddress");
  for (const r of unresolved) {
    console.log(`${r.name ?? "—"}\t${r.address ?? "—"}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
