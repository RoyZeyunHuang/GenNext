/**
 * 从「小红书违禁词库」CSV 生成 src/data/xhs-forbidden-words.json
 * 运行: node scripts/generate-xhs-forbidden-json.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function normRisk(s) {
  const t = (s || "").trim();
  if (t === "高") return "high";
  if (t === "中") return "medium";
  if (t === "低") return "low";
  return "medium";
}

function splitPhrases(cell) {
  if (!cell || !String(cell).trim()) return [];
  return String(cell)
    .trim()
    .split(/[、，,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const map = new Map();
const RANK = { high: 3, medium: 2, low: 1 };

function addPhrase(phrase, rawRisk, source) {
  const p = phrase.trim();
  if (!p) return;
  const level = normRisk(rawRisk);
  const prev = map.get(p);
  if (!prev || RANK[level] > RANK[prev.level]) {
    map.set(p, { phrase: p, level, source });
  }
}

const zongPath = path.join(root, "小红书违禁词库", "违禁词总表-Table 1.csv");
const zongText = fs.readFileSync(zongPath, "utf8");
const zongLines = zongText.split(/\r?\n/).filter((l) => l.trim());
for (let i = 1; i < zongLines.length; i++) {
  const cols = parseCsvLine(zongLines[i]);
  if (cols.length < 5) continue;
  addPhrase(cols[3], cols[4], "总表");
}

const fcPath = path.join(root, "小红书违禁词库", "房产专项速查-Table 1.csv");
const fcText = fs.readFileSync(fcPath, "utf8");
const fcLines = fcText.split(/\r?\n/).filter((l) => l.trim());
for (let i = 1; i < fcLines.length; i++) {
  const cols = parseCsvLine(fcLines[i]);
  if (cols.length < 4) continue;
  const risk = cols[3];
  if (!cols[2] || !cols[2].trim()) continue;
  for (const ph of splitPhrases(cols[2])) {
    addPhrase(ph, risk, "房产");
  }
}

const entries = Array.from(map.values()).sort((a, b) => b.phrase.length - a.phrase.length);

const outPath = path.join(root, "src", "data", "xhs-forbidden-words.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), count: entries.length, entries }),
  "utf8"
);
console.log("Wrote", outPath, "entries:", entries.length);
