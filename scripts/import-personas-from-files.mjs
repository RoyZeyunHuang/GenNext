#!/usr/bin/env node
/**
 * 从 scripts/persona-import-data/ 导入人设 Markdown + 笔记 CSV 到 Supabase（personas + persona_notes + embedding）。
 *
 * 需要：
 *   - .env.local：NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、OPENAI_API_KEY
 *   - PERSONA_IMPORT_USER_ID：目标用户 UUID（auth.users.id），人设与笔记均归属该用户
 *
 * Run（项目根目录）:
 *   PERSONA_IMPORT_USER_ID=<uuid> node --env-file=.env.local scripts/import-personas-from-files.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "persona-import-data");
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

const PERSONAS = [
  { name: "Ryan", mdFile: "persona_Ryan.md", csvFile: "ryan_notes.csv" },
  { name: "Kelvin", mdFile: "persona_Kelvin.md", csvFile: "kelvin_notes.csv" },
  { name: "Connie", mdFile: "persona_Connie.md", csvFile: "connie_notes.csv" },
  { name: "Ency", mdFile: "persona_Ency.md", csvFile: "ency_notes.csv" },
];

function parseCsvRowLine(line) {
  const result = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      result.push(field.trim());
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  result.push(field.trim());
  return result;
}

/** 与 src/lib/persona-rag/csv-notes.ts 一致 */
function parsePersonaNotesCsv(csvText) {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = parseCsvRowLine(lines[0]).map((h) => h.replace(/^\uFEFF/, "").trim());
  const titleIdx = header.indexOf("笔记标题");
  const bodyIdx = header.indexOf("笔记文案");
  const likesIdx = (() => {
    const i = header.indexOf("点赞数");
    if (i >= 0) return i;
    return header.indexOf("点赞");
  })();

  if (titleIdx < 0 || bodyIdx < 0) {
    throw new Error('CSV 表头需包含「笔记标题」「笔记文案」列');
  }

  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvRowLine(lines[r]);
    const title = (cells[titleIdx] ?? "").trim();
    const body = (cells[bodyIdx] ?? "").trim();
    if (!title && !body) continue;
    if (!title || !body) {
      console.warn(`  跳过第 ${r + 1} 行：标题或文案为空`);
      continue;
    }

    const metadata = {};
    if (likesIdx >= 0 && cells[likesIdx] != null && cells[likesIdx] !== "") {
      const n = Number(String(cells[likesIdx]).replace(/,/g, ""));
      if (!Number.isNaN(n)) metadata.likes = n;
      else metadata.likes_raw = cells[likesIdx];
    }
    rows.push({ title, body, metadata });
  }
  return rows;
}

function extractShortDescription(md) {
  const m = md.match(/\*\*虚拟人生活小传\*\*[：:]\s*\n([^\n]+)/);
  const line = m ? m[1].trim() : "";
  const s = line || md.replace(/^#[^\n]+\n+/, "").slice(0, 400);
  return s.slice(0, 500);
}

async function embedTexts(texts) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input: batch,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI embedding failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const item of data.data) out.push(item.embedding);
  }
  return out;
}

async function main() {
  const userId = process.env.PERSONA_IMPORT_USER_ID?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!userId) {
    console.error("请设置 PERSONA_IMPORT_USER_ID=<你的 auth.users UUID>");
    process.exit(1);
  }
  if (!url || !key) {
    console.error("缺少 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  for (const p of PERSONAS) {
    const mdPath = path.join(DATA_DIR, p.mdFile);
    const csvPath = path.join(DATA_DIR, p.csvFile);
    if (!fs.existsSync(mdPath) || !fs.existsSync(csvPath)) {
      console.error(`缺少文件: ${mdPath} 或 ${csvPath}`);
      process.exit(1);
    }

    const bio_md = fs.readFileSync(mdPath, "utf8");
    const short_description = extractShortDescription(bio_md);
    const csvText = fs.readFileSync(csvPath, "utf8");
    let notes;
    try {
      notes = parsePersonaNotesCsv(csvText);
    } catch (e) {
      console.error(`${p.name} CSV 解析失败:`, e.message);
      process.exit(1);
    }

    console.log(`\n→ ${p.name}: bio ${bio_md.length} 字，笔记 ${notes.length} 条`);

    const { data: existing, error: findErr } = await supabase
      .from("personas")
      .select("id")
      .eq("user_id", userId)
      .eq("name", p.name)
      .maybeSingle();

    if (findErr) {
      console.error(findErr.message);
      process.exit(1);
    }

    let personaId;
    if (existing?.id) {
      personaId = existing.id;
      const { error: upErr } = await supabase
        .from("personas")
        .update({
          short_description,
          bio_md,
          updated_at: new Date().toISOString(),
        })
        .eq("id", personaId);
      if (upErr) {
        console.error(upErr.message);
        process.exit(1);
      }
      console.log(`  已存在人设 id=${personaId}，已更新 bio；将清空旧笔记并重新导入`);
      const { error: delErr } = await supabase.from("persona_notes").delete().eq("persona_id", personaId);
      if (delErr) {
        console.error(delErr.message);
        process.exit(1);
      }
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("personas")
        .insert({
          user_id: userId,
          name: p.name,
          short_description,
          bio_md,
          source_url: null,
          is_public: false,
        })
        .select("id")
        .single();

      if (insErr) {
        console.error(insErr.message);
        process.exit(1);
      }
      personaId = inserted.id;
      console.log(`  新建人设 id=${personaId}`);
    }

    if (notes.length === 0) {
      console.log("  无笔记，跳过 embedding");
      continue;
    }

    const embeddings = await embedTexts(notes.map((n) => `${n.title}\n${n.body}`));
    const rows = notes.map((n, i) => ({
      persona_id: personaId,
      user_id: userId,
      title: n.title,
      body: n.body,
      embedding: embeddings[i],
      metadata: n.metadata,
    }));

    const { error: nErr } = await supabase.from("persona_notes").insert(rows);
    if (nErr) {
      console.error(nErr.message);
      process.exit(1);
    }
    console.log(`  已插入 ${rows.length} 条笔记（含向量）`);
  }

  console.log("\n全部完成。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
