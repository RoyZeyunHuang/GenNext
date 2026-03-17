import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function pctToDecimal(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().replace(/%/g, "");
  const n = Number(s);
  if (isNaN(n)) return null;
  return n / 100;
}

/** 将日期字符串规范为 YYYY-MM-DD（供投放表 event_date 等使用） */
function normalizeDateString(v: string): string | null {
  const s = String(v).trim();
  if (!s) return null;
  const slash = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (slash) {
    const [, y, m, d] = slash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const cn = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (cn) {
    const [, y, m, d] = cn;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s.slice(0, 10);
}

/** 中文发布日期转成标准格式，如 2026年03月10日04时27分54秒 -> 2026-03-10 04:27:54 */
function parseChinesePublishTime(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(
    /(\d{4})年(\d{1,2})月(\d{1,2})日(?:(\d{1,2})时)?(?:(\d{1,2})分)?(?:(\d{1,2})秒)?/
  );
  if (m) {
    const [, y, mo, d, h = "0", min = "0", sec = "0"] = m;
    const pad = (n: string) => n.padStart(2, "0");
    return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(min)}:${pad(sec)}`;
  }
  return s;
}

function detectUploadType(filename: string): "organic" | "paid" | null {
  const lower = filename.toLowerCase();
  if (lower.includes("笔记列表明细")) return "organic";
  if (lower.includes("笔记投放数据") || lower.includes("投放")) return "paid";
  return null;
}

/** dataStartRowIndex: 数据起始行（0-based），1=第2行起，2=第3行起。表头始终为第1行。 */
function parseCsv(text: string, dataStartRowIndex = 1): Record<string, string>[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const bom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const lines = bom.split("\n").filter(Boolean);
  if (lines.length <= dataStartRowIndex) return [];
  const header = lines[0].split(",").map((c) => c.trim().replace(/^\uFEFF/, ""));
  const rows: Record<string, string>[] = [];
  for (let i = dataStartRowIndex; i < lines.length; i++) {
    const values = lines[i].split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    header.forEach((h, j) => {
      row[h] = values[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

// 笔记列表明细表实际表头：笔记标题、首次发布时间/发布日期、体裁、曝光、观看量、封面点击率、点赞、评论、收藏、涨粉、分享、人均观看时长、弹幕
const ORGANIC_COL_MAP: Record<string, string> = {
  笔记标题: "title",
  首次发布时间: "publish_time",
  发布日期: "publish_time",
  体裁: "genre",
  曝光: "exposure",
  观看量: "views",
  封面点击率: "cover_ctr",
  点赞: "likes",
  评论: "comments",
  收藏: "collects",
  涨粉: "follows",
  分享: "shares",
  人均观看时长: "avg_watch_time",
  弹幕: "danmaku",
};

const PAID_COL_MAP: Record<string, string> = {
  时间: "event_date",
  "笔记/素材ID": "note_id",
  "笔记/素材链接": "note_link",
  消费: "spend",
  展现量: "impressions",
  点击量: "clicks",
  点击率: "ctr",
  平均点击成本: "avg_click_cost",
  平均千次展示费用: "avg_cpm",
  互动量: "interactions",
  平均互动成本: "avg_interaction_cost",
  "5s播放量": "play_5s",
  "5s完播率": "completion_5s",
  私信进线数: "dm_in",
  私信开口数: "dm_open",
  私信留资数: "dm_lead",
  私信进线成本: "dm_in_cost",
  私信留资成本: "dm_lead_cost",
  笔记作者ID: "author_id",
  创作者: "creator",
  视频播放量: "video_plays",
  私信留资人数: "dm_lead_persons",
  私信开口成本: "dm_open_cost",
  "微信加好友(计费时间)": "wechat_adds",
  "微信加好友率(计费时间)": "wechat_add_rate",
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file?.size) return NextResponse.json({ error: "请选择文件" }, { status: 400 });
    const snapshotDateFromForm = (formData.get("snapshot_date") as string) || "";
    const snapshotDate =
      snapshotDateFromForm ||
      (typeof file.lastModified === "number" && file.lastModified > 0
        ? new Date(file.lastModified).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10));

    const type = detectUploadType(file.name);
    if (!type) {
      return NextResponse.json(
        { error: "无法识别文件类型，请使用「笔记列表明细」或「笔记投放数据/投放」相关文件名" },
        { status: 400 }
      );
    }

    if (type === "organic") {
      const buf = Buffer.from(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: "buffer" });
      const firstSheet = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheet];
      const normalize = (s: string) => s.replace(/\s/g, "").replace(/\u200b/g, "").trim();
      const buildColMap = (headerRow: Record<string, unknown>) => {
        const colMap: Record<string, string> = {};
        for (const [colIndex, cellValue] of Object.entries(headerRow || {})) {
          const label = String(cellValue ?? "").trim();
          const noSpaces = normalize(label);
          let mapped = ORGANIC_COL_MAP[label] ?? ORGANIC_COL_MAP[noSpaces];
          if (!mapped) {
            for (const [cnKey, dbCol] of Object.entries(ORGANIC_COL_MAP)) {
              if (label.includes(cnKey) || noSpaces.includes(cnKey) || cnKey.includes(noSpaces)) {
                mapped = dbCol;
                break;
              }
            }
          }
          if (mapped) colMap[mapped] = colIndex;
        }
        return colMap;
      };
      // 先尝试第 2 行为表头（range:1），再尝试第 1 行为表头（range:0）
      let raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        range: 1,
        header: 0,
        defval: "",
        raw: false,
      }) as unknown[];
      let headerRow = raw[0] as Record<string, unknown>;
      let colMap = buildColMap(headerRow);
      let dataStartRow = 1;
      if (!colMap.title && raw.length > 0) {
        raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          range: 0,
          header: 0,
          defval: "",
          raw: false,
        }) as unknown[];
        headerRow = raw[0] as Record<string, unknown>;
        colMap = buildColMap(headerRow);
        dataStartRow = 1;
      }
      if (!raw?.length) {
        return NextResponse.json(
          { error: "Excel 未解析到任何行，请确认表头行为：笔记标题、首次发布时间/发布日期、体裁、曝光、观看量等" },
          { status: 400 }
        );
      }
      if (!colMap.title) {
        return NextResponse.json(
          {
            error: "未能识别表头，请确认表头行为：笔记标题、首次发布时间/发布日期、体裁、曝光、观看量、封面点击率、点赞、评论、收藏、涨粉、分享、人均观看时长、弹幕",
            debug: { receivedHeaderValues: Object.values(headerRow).slice(0, 20) },
          },
          { status: 400 }
        );
      }
      const rows: Record<string, unknown>[] = [];
      for (let i = dataStartRow; i < raw.length; i++) {
        const row = raw[i] as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [dbCol, cnCol] of Object.entries(colMap)) {
          let v = row[cnCol];
          if (dbCol === "cover_ctr") {
            const p = pctToDecimal(v);
            out[dbCol] = p != null ? p : toNum(v);
          } else if (["exposure", "views", "likes", "comments", "collects", "follows", "shares", "danmaku"].includes(dbCol)) {
            out[dbCol] = toNum(v);
          } else if (dbCol === "avg_watch_time") {
            out[dbCol] = toNum(v) || null;
          } else if (dbCol === "publish_time") {
            out[dbCol] = parseChinesePublishTime(v) ?? null;
          } else {
            out[dbCol] = v != null && v !== "" ? String(v).trim() : null;
          }
        }
        const title = String(out.title ?? "").trim();
        if (!title) continue;
        rows.push({
      snapshot_date: snapshotDate,
          title,
          publish_time: out.publish_time ?? null,
          genre: out.genre ?? null,
          exposure: out.exposure ?? 0,
          views: out.views ?? 0,
          cover_ctr: out.cover_ctr ?? null,
          likes: out.likes ?? 0,
          comments: out.comments ?? 0,
          collects: out.collects ?? 0,
          follows: out.follows ?? 0,
          shares: out.shares ?? 0,
          avg_watch_time: out.avg_watch_time ?? null,
          danmaku: out.danmaku ?? 0,
        });
      }
      if (rows.length === 0) {
        return NextResponse.json(
          { error: "未解析到有效数据行（需有「笔记标题」且非空），请确认数据从第 3 行起" },
          { status: 400 }
        );
      }
      const deduped = new Map<string, Record<string, unknown>>();
      for (const r of rows) {
        deduped.set(`${r.title}|${snapshotDate}`, r);
      }
      const rowsToInsert = Array.from(deduped.values());

      const existingKeys = new Set<string>();
      const { data: existing, error: fetchError } = await supabase
        .from("xhs_notes")
        .select("title, snapshot_date")
        .eq("snapshot_date", snapshotDate);
      if (fetchError) {
        return NextResponse.json(
          { error: `查询已存在数据失败: ${fetchError.message}，请确认已执行迁移 009 并存在 xhs_notes 表` },
          { status: 500 }
        );
      }
      for (const r of existing ?? []) {
        existingKeys.add(`${r.title}|${snapshotDate}`);
      }
      const toInsert = rowsToInsert.filter(
        (r) => !existingKeys.has(`${r.title}|${snapshotDate}`)
      );
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += 100) {
        const batch = toInsert.slice(i, i + 100);
        const { error } = await supabase.from("xhs_notes").insert(batch);
        if (error) {
          return NextResponse.json(
            { error: `写入失败: ${error.message}`, code: error.code },
            { status: 500 }
          );
        }
        inserted += batch.length;
      }
      const skipped = rowsToInsert.length - inserted;
      return NextResponse.json({
        type: "organic",
        snapshot_date: snapshotDate,
        imported: inserted,
        skipped,
        message: `成功导入 ${inserted} 条，跳过 ${skipped} 条重复`,
      });
    }

    if (type === "paid") {
      const text = await file.text();
      // 投放表：表头第1行，数据从第3行开始（跳过第2行）
      const csvRows = parseCsv(text, 2);
      const headerKeys = csvRows.length > 0 ? Object.keys(csvRows[0]) : [];
      const getPaidCol = (possibleNames: string[], row: Record<string, string>) => {
        for (const name of possibleNames) {
          const v = row[name];
          if (v !== undefined && v !== "") return String(v).trim();
        }
        return "";
      };
      const rows: Record<string, unknown>[] = [];
      for (const row of csvRows) {
        const eventDateRaw = getPaidCol(["时间", "日期", "event_date"], row);
        const eventDate = normalizeDateString(eventDateRaw) || eventDateRaw;
        const noteId = getPaidCol(["笔记/素材ID", "笔记素材ID", "note_id"], row);
        if (!eventDate) continue;
        const get = (cn: string) => row[cn] ?? "";
        const ctrVal = get("点击率");
        const completionVal = get("5s完播率");
        const wechatRateVal = get("微信加好友率(计费时间)");
        rows.push({
          event_date: eventDate,
          note_id: noteId || null,
          note_link: get("笔记/素材链接") || null,
          spend: toNum(get("消费")),
          impressions: toNum(get("展现量")),
          clicks: toNum(get("点击量")),
          ctr: pctToDecimal(ctrVal) ?? toNum(ctrVal),
          avg_click_cost: toNum(get("平均点击成本")),
          avg_cpm: toNum(get("平均千次展示费用")),
          interactions: toNum(get("互动量")),
          avg_interaction_cost: toNum(get("平均互动成本")),
          play_5s: toNum(get("5s播放量")),
          completion_5s: pctToDecimal(completionVal) ?? toNum(completionVal),
          dm_in: toNum(get("私信进线数")),
          dm_open: toNum(get("私信开口数")),
          dm_lead: toNum(get("私信留资数")),
          dm_in_cost: toNum(get("私信进线成本")) || null,
          dm_lead_cost: toNum(get("私信留资成本")) || null,
          author_id: get("笔记作者ID") || null,
          creator: get("创作者") || null,
          video_plays: toNum(get("视频播放量")),
          dm_lead_persons: toNum(get("私信留资人数")),
          dm_open_cost: toNum(get("私信开口成本")) || null,
          wechat_adds: toNum(get("微信加好友(计费时间)")),
          wechat_add_rate: (pctToDecimal(wechatRateVal) ?? toNum(wechatRateVal)) || null,
        });
      }

      if (rows.length === 0) {
        return NextResponse.json(
          {
            error: "未解析到有效数据行，请确认 CSV 第 1 行为表头且包含「时间」或「日期」列",
            debug: { headerKeys: headerKeys.slice(0, 15) },
          },
          { status: 400 }
        );
      }

      let upserted = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase.from("xhs_paid_daily").upsert(batch, {
          onConflict: "note_id,event_date",
        });
        if (error) {
          return NextResponse.json(
            { error: `写入失败: ${error.message}`, code: error.code },
            { status: 500 }
          );
        }
        upserted += batch.length;
      }
      return NextResponse.json({
        type: "paid",
        imported: upserted,
        message: `成功导入 ${upserted} 条`,
      });
    }

    return NextResponse.json({ error: "未知类型" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg || "上传失败" },
      { status: 500 }
    );
  }
}
