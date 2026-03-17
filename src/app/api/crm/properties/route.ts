import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// All 小区 from AREA_MAP (for 其他 filter)
const ALL_KNOWN_AREAS = [
  "Midtown", "Upper East Side", "Upper West Side", "Harlem", "East Harlem", "Washington Heights", "Inwood", "Marble Hill", "FiDi", "Tribeca", "SoHo", "NoHo", "East Village", "West Village", "Greenwich Village", "Chelsea", "Hells Kitchen", "Murray Hill", "Gramercy", "Flatiron", "NoMad", "Kips Bay", "Stuyvesant Town", "Lower East Side", "Chinatown", "Battery Park City", "Hudson Yards", "Morningside Heights", "Hamilton Heights", "Sugar Hill",
  "Williamsburg", "DUMBO", "Downtown Brooklyn", "Brooklyn Heights", "Park Slope", "Prospect Heights", "Fort Greene", "Clinton Hill", "Bed-Stuy", "Bushwick", "Greenpoint", "Cobble Hill", "Boerum Hill", "Carroll Gardens", "Red Hook", "Sunset Park", "Bay Ridge", "Flatbush", "Crown Heights", "Prospect Lefferts Gardens", "Gowanus",
  "LIC", "Long Island City", "Astoria", "Jackson Heights", "Flushing", "Forest Hills", "Rego Park", "Sunnyside", "Woodside", "Elmhurst", "Jamaica", "Bayside", "Fresh Meadows", "Ridgewood",
  "South Bronx", "Mott Haven", "Fordham", "Riverdale", "Kingsbridge", "Pelham Bay", "Throgs Neck", "Morris Heights",
  "St. George", "Stapleton", "Todt Hill",
  "Journal Square", "Newport", "Downtown JC", "The Waterfront", "Paulus Hook", "Hamilton Park", "Bergen-Lafayette",
  "Hoboken",
  "Weehawken", "Union City", "West New York", "Edgewater", "Fort Lee",
];

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const areas = req.nextUrl.searchParams.get("areas") ?? "";
  const otherOnly = req.nextUrl.searchParams.get("other_only") === "1";
  let q = supabase.from("properties").select("*, property_companies(id, role, company_id, companies(id, name))").order("created_at", { ascending: false });
  if (search) q = q.ilike("name", `%${search}%`);
  if (otherOnly) {
    const inList = ALL_KNOWN_AREAS.map((a) => (a.includes(",") || a.includes(" ") ? `"${a.replace(/"/g, '""')}"` : a)).join(",");
    q = q.or(`area.is.null,area.not.in.(${inList})`);
  } else if (areas) {
    q = q.in("area", areas.split(",").filter(Boolean));
  }
  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { companies: links, ...propData } = body as Record<string, unknown> & { companies?: { company_id: string; role: string }[] };
  const { data, error } = await supabase.from("properties").insert(propData).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (links?.length) {
    await supabase.from("property_companies").insert(
      links.map((l) => ({ property_id: data.id, company_id: l.company_id, role: l.role }))
    );
  }
  return Response.json(data);
}
