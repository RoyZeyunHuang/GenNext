import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

/* ── helpers ────────────────────────────────────────────── */

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function normalizeTitle(t: string): string {
  return (t ?? "")
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff|]/g, "")
    .trim();
}

function normalizePublishTime(pt: string): string {
  if (!pt) return "";
  const d = new Date(pt);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function genKey(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchAllCorePosts() {
  const all: { post_key: string; title: string | null; title_norm: string | null; publish_time: string | null; publish_time_norm: string | null; note_id: string | null }[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data } = await supabase
      .from("core_posts")
      .select("post_key, title, title_norm, publish_time, publish_time_norm, note_id")
      .range(from, from + step - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

/* ── POST handler ───────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, rows, snapshot_date } = body as { type: string; rows: Row[]; snapshot_date?: string };
    if (!rows?.length) return Response.json({ error: "无数据" }, { status: 400 });

    if (type === "organic") return handleOrganic(rows, snapshot_date ?? new Date().toISOString().slice(0, 10));
    if (type === "paid") return handlePaid(rows);
    if (type === "ig") return handleInstagram(rows, snapshot_date ?? new Date().toISOString().slice(0, 10));

    return Response.json({ error: "不支持的类型: " + type }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "上传失败" }, { status: 500 });
  }
}

/* ── Organic ────────────────────────────────────────────── */

async function handleOrganic(rows: Row[], snapshotDate: string) {
  const postsList = await fetchAllCorePosts();

  const byTitleAndTime = new Map<string, string>();
  const byTitleOnly = new Map<string, string[]>();

  for (const p of postsList) {
    const tn = p.title_norm || normalizeTitle(p.title ?? "");
    const ptn = p.publish_time_norm || normalizePublishTime(p.publish_time ?? "");
    if (tn && ptn) byTitleAndTime.set(`${tn}|${ptn}`, p.post_key);
    if (tn) {
      const arr = byTitleOnly.get(tn) ?? [];
      arr.push(p.post_key);
      byTitleOnly.set(tn, arr);
    }
  }

  let newPosts = 0;
  let suspects = 0;
  const newCorePosts: Row[] = [];
  const snapshotRows: Row[] = [];

  for (const row of rows) {
    const title = String(row.title ?? "").trim();
    if (!title) continue;

    const publishTime = String(row.publish_time ?? "").trim();
    const titleNorm = normalizeTitle(title);
    const ptNorm = normalizePublishTime(publishTime);

    let postKey: string | null = null;

    if (titleNorm && ptNorm) {
      postKey = byTitleAndTime.get(`${titleNorm}|${ptNorm}`) ?? null;
    }

    if (!postKey && titleNorm) {
      const matches = byTitleOnly.get(titleNorm);
      if (matches?.length === 1) {
        postKey = matches[0];
      } else if (matches && matches.length > 1) {
        suspects++;
      }
    }

    if (!postKey) {
      postKey = genKey("xhs");
      const np = {
        post_key: postKey,
        title,
        title_norm: titleNorm,
        publish_time: publishTime,
        publish_time_norm: ptNorm,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      newCorePosts.push(np);
      if (titleNorm && ptNorm) byTitleAndTime.set(`${titleNorm}|${ptNorm}`, postKey);
      if (titleNorm) {
        const arr = byTitleOnly.get(titleNorm) ?? [];
        arr.push(postKey);
        byTitleOnly.set(titleNorm, arr);
      }
      newPosts++;
    }

    snapshotRows.push({
      post_key: postKey,
      snapshot_date: snapshotDate,
      genre: row.genre ?? null,
      exposure: toNum(row.exposure),
      views: toNum(row.views),
      cover_ctr: toNum(row.cover_ctr),
      likes: toNum(row.likes),
      comments: toNum(row.comments),
      collects: toNum(row.collects),
      follows: toNum(row.follows),
      shares: toNum(row.shares),
      avg_watch_time: toNum(row.avg_watch_time),
      danmaku: toNum(row.danmaku),
      run_id: `upload_${Date.now()}`,
      updated_at: new Date().toISOString(),
    });
  }

  // batch insert new core_posts
  for (let i = 0; i < newCorePosts.length; i += 100) {
    await supabase.from("core_posts").upsert(newCorePosts.slice(i, i + 100), { onConflict: "post_key" });
  }

  // GREATEST merge: fetch existing snapshots for this date
  const uniqueKeys = Array.from(new Set(snapshotRows.map((r) => r.post_key as string)));
  const existingMap = new Map<string, Row>();
  for (let i = 0; i < uniqueKeys.length; i += 500) {
    const batch = uniqueKeys.slice(i, i + 500);
    const { data } = await supabase
      .from("xhs_post_metrics_snapshots")
      .select("*")
      .eq("snapshot_date", snapshotDate)
      .in("post_key", batch);
    for (const s of data ?? []) existingMap.set(s.post_key as string, s);
  }

  const numFields = ["exposure", "views", "cover_ctr", "likes", "comments", "collects", "follows", "shares", "avg_watch_time", "danmaku"];
  const merged = snapshotRows.map((row) => {
    const existing = existingMap.get(row.post_key as string);
    if (!existing) return row;
    const result = { ...row };
    for (const f of numFields) {
      result[f] = Math.max(toNum(row[f]), toNum(existing[f]));
    }
    return result;
  });

  // batch upsert snapshots
  let imported = 0;
  for (let i = 0; i < merged.length; i += 100) {
    const batch = merged.slice(i, i + 100);
    const { error } = await supabase.from("xhs_post_metrics_snapshots").upsert(batch, { onConflict: "post_key,snapshot_date" });
    if (!error) imported += batch.length;
  }

  return Response.json({ imported, newPosts, suspects, errors: [] });
}

/* ── Paid ───────────────────────────────────────────────── */

async function handlePaid(rows: Row[]) {
  const postsList = await fetchAllCorePosts();
  const noteIdMap = new Map<string, string>();
  for (const p of postsList) {
    if (p.note_id) noteIdMap.set(p.note_id, p.post_key);
  }

  let newPosts = 0;
  const newCorePosts: Row[] = [];
  const paidRows: Row[] = [];

  for (const row of rows) {
    const noteId = String(row.note_id ?? "").trim();
    if (!noteId) continue;

    let postKey = noteIdMap.get(noteId) ?? null;
    if (!postKey) {
      postKey = genKey("xhs");
      newCorePosts.push({
        post_key: postKey,
        note_id: noteId,
        link: row.link ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      noteIdMap.set(noteId, postKey);
      newPosts++;
    }

    paidRows.push({
      post_key: postKey,
      event_date: String(row.event_date ?? "").trim(),
      spend: toNum(row.spend),
      impressions: toNum(row.impressions),
      clicks: toNum(row.clicks),
      ctr: toNum(row.ctr),
      cpc: toNum(row.cpc),
      cpm: toNum(row.cpm),
      interactions: toNum(row.interactions),
      cpe: toNum(row.cpe),
      play_5s: toNum(row.play_5s),
      completion_5s: toNum(row.completion_5s),
      new_seed: toNum(row.new_seed),
      new_seed_cost: toNum(row.new_seed_cost),
      new_deep_seed: toNum(row.new_deep_seed),
      new_deep_seed_cost: toNum(row.new_deep_seed_cost),
      dm_in: toNum(row.dm_in),
      dm_open: toNum(row.dm_open),
      dm_lead: toNum(row.dm_lead),
      dm_in_cost: toNum(row.dm_in_cost),
      dm_open_cost: toNum(row.dm_open_cost),
      dm_lead_cost: toNum(row.dm_lead_cost),
      run_id: `upload_${Date.now()}`,
      updated_at: new Date().toISOString(),
    });
  }

  for (let i = 0; i < newCorePosts.length; i += 100) {
    await supabase.from("core_posts").upsert(newCorePosts.slice(i, i + 100), { onConflict: "post_key" });
  }

  let imported = 0;
  for (let i = 0; i < paidRows.length; i += 100) {
    const batch = paidRows.slice(i, i + 100);
    const { error } = await supabase.from("paid_metrics_daily").upsert(batch, { onConflict: "post_key,event_date" });
    if (!error) imported += batch.length;
  }

  return Response.json({ imported, newPosts, suspects: 0, errors: [] });
}

/* ── Instagram ──────────────────────────────────────────── */

async function handleInstagram(rows: Row[], snapshotDate: string) {
  const { data: existing } = await supabase.from("core_ig_posts").select("post_key").limit(50000);
  const existingSet = new Set((existing ?? []).map((p) => p.post_key));

  let newPosts = 0;
  const igPosts: Row[] = [];
  const snapRows: Row[] = [];

  for (const row of rows) {
    const igPostId = String(row.ig_post_id ?? "").trim();
    if (!igPostId) continue;
    const postKey = `ig:${igPostId}`;

    igPosts.push({
      post_key: postKey,
      ig_post_id: igPostId,
      account_id: row.account_id ?? null,
      account_username: row.account_username ?? null,
      account_name: row.account_name ?? null,
      description: row.description ?? null,
      duration_sec: toNum(row.duration_sec) || null,
      publish_time: row.publish_time ?? null,
      permalink: row.permalink ?? null,
      post_type: row.post_type ?? null,
      updated_at: new Date().toISOString(),
    });

    if (!existingSet.has(postKey)) {
      newPosts++;
      existingSet.add(postKey);
    }

    snapRows.push({
      post_key: postKey,
      snapshot_date: snapshotDate,
      views: toNum(row.views),
      reach: toNum(row.reach),
      likes: toNum(row.likes),
      comments: toNum(row.comments),
      saves: toNum(row.saves),
      shares: toNum(row.shares),
      follows: toNum(row.follows),
      run_id: `upload_${Date.now()}`,
      updated_at: new Date().toISOString(),
    });
  }

  for (let i = 0; i < igPosts.length; i += 100) {
    await supabase.from("core_ig_posts").upsert(igPosts.slice(i, i + 100), { onConflict: "post_key" });
  }

  let imported = 0;
  for (let i = 0; i < snapRows.length; i += 100) {
    const batch = snapRows.slice(i, i + 100);
    const { error } = await supabase.from("ig_post_metrics_snapshots").upsert(batch, { onConflict: "post_key,snapshot_date" });
    if (!error) imported += batch.length;
  }

  return Response.json({ imported, newPosts, suspects: 0, errors: [] });
}
