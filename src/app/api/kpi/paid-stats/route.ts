import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fromDate = searchParams.get("from_date");
  const toDate = searchParams.get("to_date");
  console.log("[paid-stats] 收到请求，参数:", { from_date: fromDate, to_date: toDate });
  if (!fromDate || !toDate) {
    return NextResponse.json(
      { error: "from_date and to_date required" },
      { status: 400 }
    );
  }

  const { data: rows, error } = await supabase
    .from("xhs_paid_daily")
    .select("*")
    .gte("event_date", fromDate)
    .lte("event_date", toDate)
    .order("event_date", { ascending: true });

  if (error) {
    console.log("[paid-stats] 查询错误:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = rows ?? [];
  console.log("[paid-stats] 查询结果条数:", list.length);

  const byNoteId = new Map<
    string,
    {
      note_id: string;
      note_title: string | null;
      spend: number;
      impressions: number;
      clicks: number;
      dm_lead: number;
      wechat_adds: number;
      video_plays: number;
      play_5s: number;
      play_5s_weighted_completion: number;
    }
  >();

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalDmLead = 0;
  let totalDmIn = 0;
  let totalDmOpen = 0;
  let totalInteractions = 0;
  let totalPlay5s = 0;
  let totalWechatAdds = 0;
  const dailyTrend: { event_date: string; spend: number; dm_lead: number; play_5s: number }[] = [];
  const dateMap = new Map<string, { spend: number; dm_lead: number; play_5s: number }>();

  for (const r of list) {
    const noteId = String(r.note_id ?? "").trim() || "__null__";
    totalSpend += toNum(r.spend);
    totalImpressions += toNum(r.impressions);
    const clicks = toNum(r.clicks);
    const dmLead = toNum(r.dm_lead);
    const dmIn = toNum(r.dm_in);
    const dmOpen = toNum(r.dm_open);
    const interactions = toNum(r.interactions);
    const p5 = toNum(r.play_5s);

    totalClicks += clicks;
    totalDmLead += dmLead;
    totalDmIn += dmIn;
    totalDmOpen += dmOpen;
    totalInteractions += interactions;
    totalPlay5s += p5;
    totalWechatAdds += toNum(r.wechat_adds);

    const vp = toNum(r.video_plays);
    const comp5 = toNum(r.completion_5s);
    const existing = byNoteId.get(noteId);
    if (existing) {
      existing.spend += toNum(r.spend);
      existing.impressions += toNum(r.impressions);
      existing.clicks += toNum(r.clicks);
      existing.dm_lead += toNum(r.dm_lead);
      existing.wechat_adds += toNum(r.wechat_adds);
      existing.video_plays += vp;
      existing.play_5s += p5;
      existing.play_5s_weighted_completion += p5 * comp5;
      if (r.note_title && !existing.note_title) existing.note_title = r.note_title;
    } else {
      byNoteId.set(noteId, {
        note_id: noteId,
        note_title: r.note_title ?? null,
        spend: toNum(r.spend),
        impressions: toNum(r.impressions),
        clicks: toNum(r.clicks),
        dm_lead: toNum(r.dm_lead),
        wechat_adds: toNum(r.wechat_adds),
        video_plays: vp,
        play_5s: p5,
        play_5s_weighted_completion: p5 * comp5,
      });
    }

    const d = r.event_date;
    const day = dateMap.get(d) ?? { spend: 0, dm_lead: 0, play_5s: 0 };
    day.spend += toNum(r.spend);
    day.dm_lead += toNum(r.dm_lead);
    day.play_5s += p5;
    dateMap.set(d, day);
  }

  const distinctNotes = byNoteId.size;
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : null;
  const avgAcqCost = totalDmLead > 0 ? totalSpend / totalDmLead : null;
  const wechatCost = totalWechatAdds > 0 ? totalSpend / totalWechatAdds : null;
  const play5sRate = totalImpressions > 0 ? totalPlay5s / totalImpressions : null;

  const kpi = {
    distinct_notes: distinctNotes,
    total_spend: totalSpend,
    total_dm_lead: totalDmLead,
    avg_acq_cost: avgAcqCost,
    total_impressions: totalImpressions,
    avg_ctr: avgCtr,
    total_dm_in: totalDmIn,
    total_dm_open: totalDmOpen,
    total_interactions: totalInteractions,
    total_play_5s: totalPlay5s,
    play5s_rate: play5sRate,
    total_wechat_adds: totalWechatAdds,
    wechat_cost: wechatCost,
  };

  const notesWithVideo = Array.from(byNoteId.entries())
    .filter(([id]) => id !== "__null__")
    .map(([, v]) => ({
      note_id: v.note_id,
      note_title: v.note_title || v.note_id.slice(0, 8),
      spend: v.spend,
      impressions: v.impressions,
      ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
      dm_lead: v.dm_lead,
      acq_cost: v.dm_lead > 0 ? v.spend / v.dm_lead : 0,
      wechat_adds: v.wechat_adds,
      video_plays: v.video_plays,
      play_5s: v.play_5s,
      completion_5s: v.play_5s > 0 ? v.play_5s_weighted_completion / v.play_5s : 0,
    }));

  const video_top5 = [...notesWithVideo]
    .sort((a, b) => b.video_plays - a.video_plays)
    .slice(0, 5)
    .map((r) => ({
      note_title: r.note_title,
      video_plays: r.video_plays,
      play_5s: r.play_5s,
      completion_5s: r.completion_5s,
    }));

  const scatter_data = notesWithVideo
    .filter((r) => r.video_plays > 0)
    .map((r) => ({
      name: r.note_title,
      note_id: r.note_id,
      video_plays: r.video_plays,
      play_5s: r.play_5s,
      completion_5s: r.completion_5s,
    }));

  for (const [d, v] of Array.from(dateMap.entries()).sort()) {
    dailyTrend.push({ event_date: d, spend: v.spend, dm_lead: v.dm_lead, play_5s: v.play_5s });
  }

  return NextResponse.json({
    kpi,
    video_top5,
    scatter_data,
    daily_trend: dailyTrend,
  });
}
