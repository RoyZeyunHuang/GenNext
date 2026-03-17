import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [propsRes, outreachRes] = await Promise.all([
      supabase.from("properties").select("id", { count: "exact", head: true }),
      supabase.from("outreach").select("id, stage, deal_status, created_at, updated_at"),
    ]);

    const totalProperties = propsRes.count ?? 0;
    const outreach = outreachRes.data ?? [];
    const totalOutreach = outreach.length;
    const won = outreach.filter((o) => (o as { stage?: string }).stage === "Won");
    const lost = outreach.filter((o) => (o as { stage?: string }).stage === "Lost");
    const active = outreach.filter(
      (o) =>
        (o as { stage?: string; deal_status?: string }).deal_status === "Active" &&
        !["Won", "Lost"].includes((o as { stage?: string }).stage ?? "")
    );
    const needFollowUp = outreach.filter((o) => (o as { deal_status?: string }).deal_status === "Need Follow Up");
    const winRate = won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;

    const avgDays =
      won.length > 0
        ? Math.round(
            won.reduce((sum, o) => {
              const start = new Date(o.created_at).getTime();
              const end = new Date(o.updated_at).getTime();
              return sum + (end - start) / (1000 * 60 * 60 * 24);
            }, 0) / won.length
          )
        : 0;

    const statusCounts: Record<string, number> = {};
    outreach.forEach((o) => {
      const stage = (o as { stage?: string }).stage ?? "Not Started";
      statusCounts[stage] = (statusCounts[stage] || 0) + 1;
    });

    const now = new Date();
    const weeks: { week: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const count = outreach.filter((o) => {
        const d = new Date(o.created_at);
        return d >= weekStart && d < weekEnd;
      }).length;
      weeks.push({ week: `W${12 - i}`, count });
    }

    const recent = outreach
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 10)
      .map((o) => ({ id: o.id, status: (o as { stage?: string }).stage ?? "Not Started", updated_at: o.updated_at }));

    return Response.json({
      totalProperties,
      totalOutreach,
      activeOutreach: active.length,
      needFollowUpCount: needFollowUp.length,
      wonCount: won.length,
      winRate,
      avgDays,
      statusCounts,
      weeks,
      recent,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "请求失败";
    return Response.json({ error: msg }, { status: 500 });
  }
}
