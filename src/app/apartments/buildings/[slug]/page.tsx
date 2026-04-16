import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ExternalLink, Phone, Building2, Train, GraduationCap,
} from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/apartments/auth";
import { NotesPanel } from "@/components/apartments/NotesPanel";
import {
  areaLabel, formatBaths, formatBeds, formatDate, formatPrice,
  formatSqft, tagColor,
} from "@/components/apartments/format";
import {
  AMENITY_CATEGORIES, AMENITY_LABELS,
  subwayBg, subwayFg,
} from "@/lib/apartments/constants";
import { getOrComputeCommutes, type CommuteResult } from "@/lib/apartments/commute";
import type { Building, Listing, BuildingNote } from "@/lib/apartments/types";
import { cn } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(slug: string) {
  const db = getSupabaseAdmin();
  let building: Building | null = null;
  const { data: b1 } = await db.from("apt_buildings").select("*").eq("building_slug", slug).maybeSingle();
  building = b1 as Building | null;
  if (!building) {
    const { data: b2 } = await db.from("apt_buildings").select("*").eq("id", slug).maybeSingle();
    building = b2 as Building | null;
  }
  if (!building) {
    const fullUrl = `https://streeteasy.com/building/${slug}`;
    const { data: b3 } = await db.from("apt_buildings").select("*").eq("id", fullUrl).maybeSingle();
    building = b3 as Building | null;
    if (!building) {
      const { data: b4 } = await db.from("apt_buildings").select("*").eq("building_url", fullUrl).maybeSingle();
      building = b4 as Building | null;
    }
  }
  if (!building) return null;
  const [listings, notes] = await Promise.all([
    db.from("apt_listings").select("*").eq("building_id", building.id).eq("is_active", true)
      .order("bedrooms", { ascending: true, nullsFirst: true })
      .order("price_monthly", { ascending: true, nullsFirst: false })
      .then((r) => r.data as Listing[] | null),
    db.from("apt_building_notes").select("*").eq("building_id", building.id)
      .order("created_at", { ascending: false })
      .then((r) => r.data as BuildingNote[] | null),
  ]);
  return { building, listings: listings ?? [], notes: notes ?? [] };
}

function SubwayBadge({ route }: { route: string }) {
  const isLong = route.length > 1;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold flex-shrink-0",
        isLong ? "h-6 px-2 text-[10px]" : "h-6 w-6 text-xs"
      )}
      style={{ backgroundColor: subwayBg(route), color: subwayFg(route) }}
    >
      {route}
    </span>
  );
}

function AmenitySection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {items.map((a) => (
          <span key={a} className="rounded-md border bg-background px-2 py-1 text-xs">
            {AMENITY_LABELS[a] ?? a.replaceAll("_", " ")}
          </span>
        ))}
      </div>
    </div>
  );
}

function CommuteBadge({ minutes }: { minutes: number }) {
  return (
    <span className={cn(
      "rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
      minutes <= 15 ? "bg-green-100 text-green-800" :
      minutes <= 30 ? "bg-yellow-100 text-yellow-800" :
      minutes <= 45 ? "bg-orange-100 text-orange-800" :
      "bg-red-100 text-red-800"
    )}>
      ~{minutes} min
    </span>
  );
}

export default async function BuildingDetailPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug);
  const data = await load(slug);
  if (!data) notFound();
  const { building, listings, notes } = data;
  const user = await getSessionUser();
  const available = building.open_rentals_count ?? building.active_rentals_count ?? listings.length;

  // ---- Subways: normalize Apify shape ----
  const subways = ((building.subways ?? []) as Array<Record<string, unknown>>).map(s => ({
    name: String(s.station_name ?? s.name ?? ""),
    routes: (s.routes ?? []) as string[],
    distance: Number(s.distance ?? 0),
  })).filter(s => s.name);

  // ---- Amenities: group by category ----
  const amenitySet = new Set(building.amenities ?? []);
  const grouped: Record<string, string[]> = {};
  for (const [cat, ids] of Object.entries(AMENITY_CATEGORIES)) {
    const hits = ids.filter((id) => amenitySet.has(id));
    if (hits.length > 0) grouped[cat] = hits;
  }
  const categorized = new Set(Object.values(AMENITY_CATEGORIES).flat());
  const uncategorized = [...amenitySet].filter((a) => !categorized.has(a));
  if (uncategorized.length > 0) grouped["Other"] = uncategorized;

  // ---- Commutes: real Google Maps when possible, cached ----
  const bAny = building as Record<string, unknown>;
  const lat = bAny.latitude ? Number(bAny.latitude) : null;
  const lng = bAny.longitude ? Number(bAny.longitude) : null;
  const commutes: CommuteResult[] = await getOrComputeCommutes({
    buildingId: building.id,
    lat, lng,
    cached: (bAny.commutes as CommuteResult[]) ?? null,
    cachedAt: (bAny.commutes_fetched_at as string) ?? null,
    saveCache: async (results) => {
      const db = getSupabaseAdmin();
      await db.from("apt_buildings")
        .update({ commutes: results, commutes_fetched_at: new Date().toISOString() })
        .eq("id", building.id);
    },
  });

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-3 py-4 lg:gap-6 lg:px-6 lg:py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        <Link href="/apartments" className="hover:underline">Apartments</Link>
        <span>/</span>
        <span className="truncate text-foreground">{building.name}</span>
      </div>

      {/* Hero */}
      <section className="flex flex-col overflow-hidden rounded-xl border bg-card md:flex-row">
        <div className="relative h-48 w-full flex-shrink-0 bg-muted sm:h-60 md:h-72 md:w-72 lg:h-80 lg:w-80">
          {building.image_url ? (
            <Image src={building.image_url} alt="" fill className="object-cover" unoptimized sizes="(max-width: 768px) 100vw, 320px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">no photo</div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4 lg:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold sm:text-2xl">{building.name}</h1>
            {building.tag && (
              <span className={cn("rounded px-2 py-0.5 text-xs font-semibold uppercase ring-1", tagColor(building.tag))}>
                {building.tag.replace("_", " ")}
              </span>
            )}
            <span className="text-xs text-muted-foreground sm:text-sm">· {areaLabel(building.area)}</span>
          </div>
          <p className="text-sm text-muted-foreground">{building.address}</p>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {building.year_built && <span><Building2 className="mr-1 inline h-4 w-4 text-muted-foreground" />Built {building.year_built}</span>}
            {building.floor_count && <span>{building.floor_count} fl</span>}
            {building.unit_count && <span>{building.unit_count.toLocaleString()} units</span>}
            <span><strong className="text-primary">{available}</strong> available</span>
            {building.closed_rentals_count != null && (
              <span className="text-muted-foreground">{building.closed_rentals_count} past</span>
            )}
          </div>

          {building.note && (
            <div className="rounded-md border-l-4 border-primary bg-primary/5 px-3 py-2 text-sm italic">{building.note}</div>
          )}

          <div className="mt-auto flex flex-wrap gap-2">
            <a href={building.building_url} target="_blank" rel="noopener"
              className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent">
              <ExternalLink className="h-3.5 w-3.5" /> StreetEasy
            </a>
            {building.official_url && (
              <a href={building.official_url} target="_blank" rel="noopener"
                className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent">
                🏠 Official
              </a>
            )}
            {building.leasing_phone && (
              <a href={`tel:${building.leasing_phone}`}
                className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent">
                <Phone className="h-3.5 w-3.5" /> Leasing
              </a>
            )}
          </div>
        </div>
      </section>

      {/* INFO BLOCKS — building info first */}

      {/* About description */}
      {building.description && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-semibold">About</h2>
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
            {building.description}
          </div>
        </section>
      )}

      {/* Amenities */}
      {Object.keys(grouped).length > 0 && (
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Amenities & Policies</h2>
          {Object.entries(grouped).map(([cat, items]) => (
            <AmenitySection key={cat} title={cat} items={items} />
          ))}
        </section>
      )}

      {/* Commute to Campus — full width with rich info */}
      {commutes.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 font-semibold">
            <GraduationCap className="h-4 w-4" /> Commute to Campus
          </h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {commutes
              .slice()
              .sort((a, b) => (a.transit?.durationMinutes ?? 999) - (b.transit?.durationMinutes ?? 999))
              .map((c) => {
                const transit = c.transit;
                const lines = transit?.lines ?? [];
                return (
                  <div key={c.campusShortName} className="rounded-md border bg-background p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{c.campusShortName}</span>
                      {transit && <CommuteBadge minutes={transit.durationMinutes} />}
                    </div>
                    {/* Subway lines used */}
                    {lines.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                        {lines.map((line, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <span className="text-xs text-muted-foreground">→</span>}
                            <SubwayBadge route={line} />
                          </span>
                        ))}
                      </div>
                    )}
                    {/* All 3 modes summary */}
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      {transit && (
                        <span title="Transit">🚇 {transit.durationMinutes}min</span>
                      )}
                      {c.walking && (
                        <span title="Walking">🚶 {c.walking.durationMinutes}min</span>
                      )}
                      {c.driving && (
                        <span title="Driving">🚗 {c.driving.durationMinutes}min</span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">
            * Real-time Google Maps · transit uses next available departure
          </p>
        </section>
      )}

      {/* Transit + Notes side-by-side on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Transit (subway stations near building) */}
        {subways.length > 0 && (
          <section className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-1.5 font-semibold">
              <Train className="h-4 w-4" /> Transit
            </h3>
            <ul className="space-y-2.5">
              {subways.slice(0, 8).map((sub, i) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {sub.routes.map((r) => <SubwayBadge key={r} route={r} />)}
                    <span className="text-sm truncate">{sub.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                    {sub.distance.toFixed(2)} mi
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Team Notes */}
        <NotesPanel notes={notes} buildingId={building.id} currentUserId={user?.id} />
      </div>

      {/* AVAILABLE UNITS — moved to bottom per user request */}
      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">Available Units ({listings.length})</h2>
          <Link href={`/apartments/units`} className="text-xs text-primary hover:underline">
            Search all units →
          </Link>
        </div>
        {listings.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            None available in our last scan. Check StreetEasy for live inventory.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Unit</th>
                    <th className="px-3 py-2 text-left">Price</th>
                    <th className="px-3 py-2 text-left">Layout</th>
                    <th className="px-3 py-2 text-left">Move-in</th>
                    <th className="px-3 py-2 text-left">Concessions</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-accent/40">
                      <td className="px-3 py-2 font-medium">{u.unit ?? "—"}</td>
                      <td className="px-3 py-2 font-semibold">{formatPrice(u.price_monthly)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatBeds(u.bedrooms)}
                        {u.bathrooms ? ` · ${formatBaths(u.bathrooms)}` : ""}
                        {u.sqft ? ` · ${formatSqft(u.sqft)}` : ""}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDate(u.available_at)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {u.months_free ? `${u.months_free} mo free` : ""}
                        {u.lease_term_months ? ` · ${u.lease_term_months}mo` : ""}
                        {u.no_fee ? " · No fee" : ""}
                      </td>
                      <td className="px-3 py-2">
                        <a href={u.url} target="_blank" rel="noopener"
                          className="rounded border px-2 py-1 text-xs hover:bg-accent">
                          <ExternalLink className="inline h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y md:hidden">
              {listings.map((u) => (
                <a key={u.id} href={u.url} target="_blank" rel="noopener"
                  className="block px-4 py-3 active:bg-accent/40">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-base font-semibold">{formatPrice(u.price_monthly)}</span>
                    <span className="text-xs text-muted-foreground">#{u.unit ?? "—"}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {formatBeds(u.bedrooms)}
                    {u.bathrooms ? ` · ${formatBaths(u.bathrooms)}` : ""}
                    {u.sqft ? ` · ${formatSqft(u.sqft)}` : ""}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span>Move-in {formatDate(u.available_at)}</span>
                    {u.months_free ? <span>· {u.months_free} mo free</span> : null}
                    {u.lease_term_months ? <span>· {u.lease_term_months}mo</span> : null}
                    {u.no_fee ? <span>· No fee</span> : null}
                  </div>
                </a>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
