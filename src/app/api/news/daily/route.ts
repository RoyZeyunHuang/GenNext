import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXTERNAL_API = "https://laundry-presentations-painting-rpg.trycloudflare.com/daily-report";

export async function GET() {
  try {
    const [extRes, { data: history }] = await Promise.all([
      fetch(EXTERNAL_API, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      supabase
        .from("news_items")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const today = extRes ?? { date: "", executive_news: [], social_viral_news: [] };

    return Response.json({ today, history: history ?? [] });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
