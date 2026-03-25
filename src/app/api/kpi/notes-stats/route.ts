import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { noteRowKey } from "@/lib/kpi-latest-notes-in-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

const emptyNotesStats = {
  kpi: {
    total_notes: 0,
    total_exposure: 0,
    total_views: 0,
    total_likes: 0,
    total_comments: 0,
    total_collects: 0,
    total_shares: 0,
    total_follows: 0,
    avg_interaction_rate: 0,
    avg_collect_rate: 0,
    avg_cover_ctr: 0,
    avg_watch_time: 0,
    paid_ratio: 0,
  },
  by_type: [] as { content_type: string; count: number; avg_interaction_rate: number }[],
  by_genre: { video: { count: 0, avg_interaction_rate: 0, avg_collect_rate: 0 }, image: { count: 0, avg_interaction_rate: 0, avg_collect_rate: 0 } },
  top10: [] as unknown[],
  notes: [] as unknown[],
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from_date = searchParams.get("from_date");
  const to_date = searchParams.get("to_date");
  const contentTypes = searchParams.getAll("content_type").filter(Boolean);
  const genre = searchParams.get("genre") || "";
  const accountNames = searchParams.getAll("account").filter(Boolean);

  console.log("[notes-stats] 收到请求，参数:", {
    from_date: from_date ?? "(未传)",
    to_date: to_date ?? "(未传)",
    content_type: contentTypes,
    genre: genre || "(全部)",
  });

  if (!from_date || !to_date) {
    return NextResponse.json(emptyNotesStats, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  }

  // 账号过滤
  let accountNoteIds: string[] | null = null;
  if (accountNames.length > 0) {
    const { data: paidRows } = await supabase
      .from("xhs_paid_daily")
      .select("note_id")
      .in("creator", accountNames)
      .not("note_id", "is", null);
    accountNoteIds = Array.from(
      new Set((paidRows ?? []).map((r) => r.note_id as string).filter(Boolean))
    );
    if (accountNoteIds.length === 0) {
      return NextResponse.json(emptyNotesStats, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      });
    }
  }

  type RawRow = {
    note_id?: string | null;
    title?: string | null;
    snapshot_date?: string;
    publish_date?: string | null;
    genre?: string;
    content_type?: string;
    exposure?: unknown;
    views?: unknown;
    likes?: unknown;
    comments?: unknown;
    collects?: unknown;
    shares?: unknown;
    follows?: unknown;
    cover_ctr?: unknown;
    avg_watch_time?: unknown;
    is_paid?: unknown;
  };

  // 主查询：publish_date 在范围内的所有快照行
  let primaryQ = supabase
    .from("xhs_notes_with_publish_date")
    .select("*")
    .gte("publish_date", from_date)
    .lte("publish_date", to_date);
  if (accountNoteIds && accountNoteIds.length > 0) {
    primaryQ = primaryQ.in("note_id", accountNoteIds);
  }
  if (contentTypes.length > 0) primaryQ = primaryQ.in("content_type", contentTypes);
  if (genre && genre !== "全部") primaryQ = primaryQ.eq("genre", genre);
  const { data: primaryRows, error } = await primaryQ;
  if (error) {
    console.log("[notes-stats] 主查询错误:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 兜底查询：publish_date 为 NULL 时用 snapshot_date 过滤
  let fallbackQ = supabase
    .from("xhs_notes_with_publish_date")
    .select("*")
    .is("publish_date", null)
    .gte("snapshot_date", from_date)
    .lte("snapshot_date", to_date);
  if (accountNoteIds && accountNoteIds.length > 0) {
    fallbackQ = fallbackQ.in("note_id", accountNoteIds);
  }
  if (contentTypes.length > 0) fallbackQ = fallbackQ.in("content_type", contentTypes);
  if (genre && genre !== "全部") fallbackQ = fallbackQ.eq("genre", genre);
  const { data: fallbackRows } = await fallbackQ;

  const allRows = [...(primaryRows ?? []), ...(fallbackRows ?? [])] as RawRow[];

  // 每笔记保留最新快照（key = note_id 优先，否则 title）
  const latestByNote = new Map<string, RawRow>();
  for (const row of allRows) {
    const key = String(row.note_id ?? row.title ?? "").trim();
    if (!key) continue;
    const existing = latestByNote.get(key);
    if (!existing || String(row.snapshot_date) > String(existing.snapshot_date)) {
      latestByNote.set(key, row);
    }
  }
  let list = Array.from(latestByNote.values());
  const noteKeyFilter = searchParams
    .getAll("note_key")
    .map((k) => k.trim())
    .filter(Boolean);
  if (noteKeyFilter.length > 0) {
    const allowed = new Set(noteKeyFilter);
    list = list.filter((r) => allowed.has(noteRowKey(r)));
  }
  console.log(
    `[notes-stats] publish范围[${from_date}→${to_date}] 主${(primaryRows ?? []).length}行+兜底${(fallbackRows ?? []).length}行 → 去重后${noteKeyFilter.length ? `${list.length}（过滤）` : `${list.length}`}`
  );

  const totalNotes = list.length;
  const totalExposure = list.reduce((s, r) => s + Number(r.exposure || 0), 0);
  const totalViews = list.reduce((s, r) => s + Number(r.views || 0), 0);
  const totalInteractions = list.reduce(
    (s, r) =>
      s +
      toNum(r.likes) +
      toNum(r.comments) +
      toNum(r.collects) +
      toNum(r.shares),
    0
  );
  const totalCollects = list.reduce((s, r) => s + toNum(r.collects), 0);
  const totalFollows = list.reduce((s, r) => s + toNum(r.follows), 0);
  const exposureWeightedCtr = list.reduce(
    (s, r) => s + Number(r.exposure || 0) * toNum(r.cover_ctr),
    0
  );
  const paidCount = list.filter((r) => r.is_paid === true).length;

  const avgInteractionRate = totalViews > 0 ? totalInteractions / totalViews : 0;
  const avgCollectRate = totalViews > 0 ? totalCollects / totalViews : 0;
  const avgCoverCtr =
    totalExposure > 0 ? exposureWeightedCtr / totalExposure : 0;
  const weightedWatch = list.reduce(
    (s, r) => s + toNum(r.avg_watch_time) * Number(r.views || 0),
    0
  );
  const avgWatchTime = totalViews > 0 ? weightedWatch / totalViews : 0;
  const paidRatio = totalNotes > 0 ? paidCount / totalNotes : 0;

  const totalLikes = list.reduce((s, r) => s + toNum(r.likes), 0);
  const totalComments = list.reduce((s, r) => s + toNum(r.comments), 0);
  const totalShares = list.reduce((s, r) => s + toNum(r.shares), 0);

  const kpi = {
    total_notes: totalNotes,
    total_exposure: totalExposure,
    total_views: totalViews,
    total_likes: totalLikes,
    total_comments: totalComments,
    total_collects: totalCollects,
    total_shares: totalShares,
    total_follows: totalFollows,
    avg_interaction_rate: avgInteractionRate,
    avg_collect_rate: avgCollectRate,
    avg_cover_ctr: avgCoverCtr,
    avg_watch_time: avgWatchTime,
    paid_ratio: paidRatio,
  };

  const byTypeMap = new Map<
    string,
    { total_views: number; total_interactions: number; total_collects: number; count: number }
  >();
  const contentTypeLabels = [
    "节日轻广",
    "日常吐槽",
    "租房攻略",
    "楼盘测评",
    "活动预告",
    "活动回顾",
  ];
  for (const label of contentTypeLabels) {
    byTypeMap.set(label, {
      total_views: 0,
      total_interactions: 0,
      total_collects: 0,
      count: 0,
    });
  }
  for (const r of list) {
    const t = r.content_type || "未分类";
    if (!byTypeMap.has(t)) byTypeMap.set(t, { total_views: 0, total_interactions: 0, total_collects: 0, count: 0 });
    const rec = byTypeMap.get(t)!;
    const views = Number(r.views || 0);
    const interactions =
      toNum(r.likes) + toNum(r.comments) + toNum(r.collects) + toNum(r.shares);
    rec.count += 1;
    rec.total_views += views;
    rec.total_interactions += interactions;
    rec.total_collects += toNum(r.collects);
  }
  const by_type = Array.from(byTypeMap.entries()).map(([content_type, rec]) => ({
    content_type,
    count: rec.count,
    avg_interaction_rate:
      rec.total_views > 0 ? rec.total_interactions / rec.total_views : 0,
  }));

  const videoList = list.filter((r) => r.genre === "视频");
  const imageList = list.filter((r) => r.genre === "图文");
  const videoViews = videoList.reduce((s, r) => s + Number(r.views || 0), 0);
  const videoInteractions = videoList.reduce(
    (s, r) =>
      s +
      toNum(r.likes) +
      toNum(r.comments) +
      toNum(r.collects) +
      toNum(r.shares),
    0
  );
  const videoCollects = videoList.reduce((s, r) => s + toNum(r.collects), 0);
  const imageViews = imageList.reduce((s, r) => s + Number(r.views || 0), 0);
  const imageInteractions = imageList.reduce(
    (s, r) =>
      s +
      toNum(r.likes) +
      toNum(r.comments) +
      toNum(r.collects) +
      toNum(r.shares),
    0
  );
  const imageCollects = imageList.reduce((s, r) => s + toNum(r.collects), 0);
  const by_genre = {
    video: {
      count: videoList.length,
      avg_interaction_rate:
        videoViews > 0 ? videoInteractions / videoViews : 0,
      avg_collect_rate: videoViews > 0 ? videoCollects / videoViews : 0,
    },
    image: {
      count: imageList.length,
      avg_interaction_rate:
        imageViews > 0 ? imageInteractions / imageViews : 0,
      avg_collect_rate: imageViews > 0 ? imageCollects / imageViews : 0,
    },
  };

  const withRate = list.map((r) => {
    const views = Number(r.views || 0);
    const interactions =
      toNum(r.likes) +
      toNum(r.comments) +
      toNum(r.collects) +
      toNum(r.shares);
    return {
      ...r,
      interaction_rate: views > 0 ? interactions / views : 0,
      collect_rate: views > 0 ? toNum(r.collects) / views : 0,
    };
  });
  const top10 = withRate
    .sort((a, b) => b.interaction_rate - a.interaction_rate)
    .slice(0, 10)
    .map((r, i) => ({
      rank: i + 1,
      title: r.title,
      genre: r.genre,
      exposure: Number(r.exposure ?? 0),
      interaction_rate: r.interaction_rate,
      collect_rate: r.collect_rate,
      follows: toNum(r.follows),
      is_paid: !!r.is_paid,
    }));

  const notes = list.map((r) => ({
    title: r.title,
    genre: r.genre,
    exposure: Number(r.exposure ?? 0),
    views: Number(r.views ?? 0),
    likes: toNum(r.likes),
    comments: toNum(r.comments),
    collects: toNum(r.collects),
    shares: toNum(r.shares),
    follows: toNum(r.follows),
    cover_ctr: r.cover_ctr != null ? Number(r.cover_ctr) : null,
  }));

  return NextResponse.json({ kpi, by_type, by_genre, top10, notes }, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
