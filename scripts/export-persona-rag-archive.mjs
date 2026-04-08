#!/usr/bin/env node
/**
 * 将黑魔法（人设 RAG）全量导出为本地 JSON 存档。
 * 需 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY（绕过 RLS，导出全部人设与笔记）。
 *
 * Run（项目根目录）:
 *   node --env-file=.env.local scripts/export-persona-rag-archive.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("缺少 NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL 以及密钥（SERVICE_ROLE 或 ANON）。");
  console.error("请使用: node --env-file=.env.local scripts/export-persona-rag-archive.mjs");
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("提示: 未设置 SUPABASE_SERVICE_ROLE_KEY，使用 ANON 导出；若线上 RLS 收紧可能失败。");
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: personas, error: e1 } = await supabase
  .from("personas")
  .select("*")
  .order("updated_at", { ascending: false });

if (e1) {
  console.error("personas:", e1.message);
  process.exit(1);
}

const { data: persona_notes, error: e2 } = await supabase
  .from("persona_notes")
  .select("*")
  .order("created_at", { ascending: true });

if (e2) {
  console.error("persona_notes:", e2.message);
  process.exit(1);
}

const stamp = todayYmd();
const payload = {
  label: "黑魔法人设档案",
  exported_at: new Date().toISOString(),
  date: stamp,
  personas: personas ?? [],
  persona_notes: persona_notes ?? [],
};

const dir = path.join(ROOT, "archive", "persona-rag");
fs.mkdirSync(dir, { recursive: true });
const outPath = path.join(dir, `persona-rag-${stamp}.json`);
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");

console.log(`已写入: ${outPath}`);
console.log(`人设 ${payload.personas.length} 条，笔记 ${payload.persona_notes.length} 条。`);
