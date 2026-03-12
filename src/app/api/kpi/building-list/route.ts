import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data } = await supabase.from("post_attributes").select("building").not("building", "is", null);
  const unique = Array.from(new Set((data ?? []).map((r: { building: string }) => r.building).filter(Boolean))).sort();
  return Response.json(unique);
}
