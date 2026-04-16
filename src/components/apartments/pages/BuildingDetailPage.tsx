import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ExternalLink, Building2, Train, GraduationCap,
} from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/apartments/auth";
import { NotesPanel } from "@/components/apartments/NotesPanel";
import {
  areaLabel, formatBaths, formatBeds, formatDate, formatPrice,
  formatSqft, tagColor, shouldShowTag, tagLabel, effectiveBuildingImage,
} from "@/components/apartments/format";
import {
  AMENITY_CATEGORIES, AMENITY_LABELS,
  subwayBg, subwayFg,
} from "@/lib/apartments/constants";
import { getOrComputeCommutes, type CommuteResult } from "@/lib/apartments/commute";
import { formatBuildingSnippet } from "@/lib/apartments/wechat";
import { effectiveRent } from "@/lib/apartments/compute";
import { extractDescriptionAmenities, bulletEmoji } from "@/lib/apartments/extract";
import { SendToCopywriterButton } from "@/components/apartments/SendToCopywriterButton";
import { PitchGenerator } from "@/components/apartments/PitchGenerator";
import { TrendSparklines } from "@/components/apartments/TrendSparklines";
import { getRecentSnapshots, ensureTodaySnapshot } from "@/lib/apartments/snapshots";
import type { Building, Listing, BuildingNote } from "@/lib/apartments/types";
import { cn } from "@/lib/utils";

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

/**
 * Shared page body for the building-detail view.
 * Mounted at `/apartments/buildings/[slug]` and the equivalent RF path.
 */
export async function BuildingDetailPage({
  slug,
  basePath,
}: {
  slug: string;
  basePath: string;
}) {
  const data = await load(slug);
  if (!data) notFound();
  const { building, listings, notes } = data;
  const user = await getSessionUser();
  const prefix = basePath.replace(/\/$/, "");

  const db = getSupabaseAdmin();
  await ensureTodaySnapshot(db, building.id).catch(() => undefined);
  const snapshots = await getRecentSnapshots(db, building.id, 30).catch(() => []);
  const available = building.open_rentals_count ?? building.active_rentals_count ?? listings.length;
  const heroImage = effectiveBuildingImage(
    building.image_url,
    listings.map((l) => l.image_url),
  );

  const subways = ((building.subways ?? []) as unknown as Array<Record<string, unknown>>).map(s => ({
    name: String(s.station_name ?? s.name ?? ""),
    routes: (s.routes ?? []) as string[],
    distance: Number(s.distance ?? 0),
  })).filter(s => s.name);

  const amenitySet = new Set(building.amenities ?? []);
  const grouped: Record<string, string[]> = {};
  for (const [cat, ids] of Object.entries(AMENITY_CATEGORIES)) {
    const hits = ids.filter((id) => amenitySet.has(id));
    if (hits.length > 0) grouped[cat] = hits;
  }
  const categorized = new Set(Object.values(AMENITY_CATEGORIES).flat());
  const uncategorized = Array.from(amenitySet).filter((a) => !categorized.has(a));
  if (uncategorized.length > 0) grouped["Other"] = uncategorized;

  const descAmenities = extractDescriptionAmenities(
    building.description,
    building.amenities ?? [],
  );

  const bAny = building as unknown as Record<string, unknown>;
  const lat = bAny.latitude ? Number(bAny.latitude) : null;
  const lng = bAny.longitude ? Number(bAny.longitude) : null;
  const commutes: CommuteResult[] = await getOrComputeCommutes({
    buildingId: building.id,
    lat, lng,
    cached: (bAny.commutes as CommuteResult[]) ?? null,
    cachedAt: (bAny.commutes_fetched_at as string) ?? null,
    saveCache: async (results) => {
      const adminDb = getSupabaseAdmin();
      await adminDb.from("apt_buildings")
        .update({ commutes: results, commutes_fetched_at: new Date().toISOString() })
        .eq("id", building.id);
    },
  });

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-3 py-4 lg:gap-6 lg:px-6 lg:py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        <Link href={prefix} className="hover:underline">公寓</Link>
        <span>/</span>
        <span className="truncate text-foreground">{building.name}</span>
      </div>

      {/* Hero */}
      <section className="flex flex-col overflow-hidden rounded-xl border bg-card md:flex-row">
        <div className="relative h-48 w-full flex-shrink-0 bg-muted sm:h-60 md:h-72 md:w-72 lg:h-80 lg:w-80">
          {heroImage ? (
            <Image src={heroImage} alt="" fill className="object-cover" unoptimized sizes="(max-width: 768px) 100vw, 320px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">暂无照片</div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4 lg:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold sm:text-2xl">{building.name}</h1>
            {shouldShowTag(building.tag) && (
              <span className={cn("rounded px-2 py-0.5 text-xs font-semibold uppercase ring-1", tagColor(building.tag))}>
                {tagLabel(building.tag)}
              </span>
            )}
            <span className="text-xs text-muted-foreground sm:text-sm">· {areaLabel(building.area)}</span>
          </div>
          <p className="text-sm text-muted-foreground">{building.address}</p>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {building.year_built && <span><Building2 className="mr-1 inline h-4 w-4 text-muted-foreground" />{building.year_built} 年建</span>}
            {building.floor_count && <span>{building.floor_count} 层</span>}
            {building.unit_count && <span>共 {building.unit_count.toLocaleString()} 套</span>}
            <span><strong className="text-primary">{available}</strong> 套在租</span>
            {building.closed_rentals_count != null && (
              <span className="text-muted-foreground">历史 {building.closed_rentals_count} 套</span>
            )}
          </div>

          {building.note && (
            <div className="rounded-md border-l-4 border-primary bg-primary/5 px-3 py-2 text-sm italic">{building.note}</div>
          )}

          <div className="mt-auto flex flex-wrap gap-2">
            <a
              href={building.building_url}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent"
            >
              🔗 StreetEasy
            </a>
            {building.official_url && (
              <a
                href={building.official_url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent"
              >
                🏠 官网
              </a>
            )}
            <SendToCopywriterButton
              content={formatBuildingSnippet({ building, activeListings: listings, commutes })}
              label="✨ 黑魔法"
              icon={null}
              targetHref={
                basePath.startsWith("/rednote-factory")
                  ? "/rednote-factory/copywriter-rag"
                  : "/copywriter"
              }
              className="gap-1.5 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      <PitchGenerator buildingSlug={building.building_slug ?? building.id} />

      {building.description && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-semibold">楼盘介绍</h2>
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
            {building.description}
          </div>
        </section>
      )}

      {(Object.keys(grouped).length > 0 || descAmenities.length > 0) && (
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">配套与政策</h2>
          {Object.entries(grouped).map(([cat, items]) => (
            <AmenitySection key={cat} title={cat} items={items} />
          ))}
          {descAmenities.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
                楼盘介绍中的特色
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {descAmenities.map((item) => (
                  <span
                    key={item}
                    className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900"
                    title="来源:楼盘介绍中的项目"
                  >
                    {bulletEmoji(item)} {item}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {false && snapshots.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 font-semibold">📈 近 30 天趋势</h3>
          <TrendSparklines snapshots={snapshots} />
        </section>
      )}

      {commutes.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 font-semibold">
            <GraduationCap className="h-4 w-4" /> 到校通勤
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
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      {transit && <span title="地铁">🚇 {transit.durationMinutes} 分钟</span>}
                      {c.walking && <span title="步行">🚶 {c.walking.durationMinutes} 分钟</span>}
                      {c.driving && <span title="开车">🚗 {c.driving.durationMinutes} 分钟</span>}
                    </div>
                  </div>
                );
              })}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">
            * 实时 Google Maps · 地铁按下一班车计算
          </p>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {subways.length > 0 && (
          <section className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-1.5 font-semibold">
              <Train className="h-4 w-4" /> 周边地铁
            </h3>
            <ul className="space-y-2.5">
              {subways.slice(0, 8).map((sub, i) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {sub.routes.map((r) => <SubwayBadge key={r} route={r} />)}
                    <span className="text-sm truncate">{sub.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                    {sub.distance.toFixed(2)} 英里
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <NotesPanel notes={notes} buildingId={building.id} currentUserId={user?.id} />
      </div>

      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">在租房源 ({listings.length} 套)</h2>
          <Link href={`${prefix}/units`} className="text-xs text-primary hover:underline">
            搜索全部房源 →
          </Link>
        </div>
        {listings.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            上次抓取时无在租房源,请到 StreetEasy 查看实时挂牌情况。
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">户号</th>
                    <th className="px-3 py-2 text-left">价格</th>
                    <th className="px-3 py-2 text-left">净租金</th>
                    <th className="px-3 py-2 text-left">户型</th>
                    <th className="px-3 py-2 text-left">入住</th>
                    <th className="px-3 py-2 text-left">优惠</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((u) => {
                    const eff = effectiveRent(u.price_monthly, u.months_free, u.lease_term_months);
                    return (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-accent/40">
                      <td className="px-3 py-2 font-medium">{u.unit ?? "—"}</td>
                      <td className="px-3 py-2 font-semibold">{formatPrice(u.price_monthly)}</td>
                      <td className="px-3 py-2">
                        {eff && eff !== u.price_monthly ? (
                          <span className="font-medium text-green-700">{formatPrice(eff)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatBeds(u.bedrooms)}
                        {u.bathrooms ? ` · ${formatBaths(u.bathrooms)}` : ""}
                        {u.sqft ? ` · ${formatSqft(u.sqft)}` : ""}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDate(u.available_at)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {u.months_free ? `${u.months_free} 个月免租` : ""}
                        {u.lease_term_months ? ` · 签约 ${u.lease_term_months} 个月` : ""}
                        {u.no_fee ? " · 免中介费" : ""}
                      </td>
                      <td className="px-3 py-2">
                        <a href={u.url} target="_blank" rel="noopener"
                          className="rounded border px-2 py-1 text-xs hover:bg-accent">
                          <ExternalLink className="inline h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y md:hidden">
              {listings.map((u) => {
                const eff = effectiveRent(u.price_monthly, u.months_free, u.lease_term_months);
                return (
                <a key={u.id} href={u.url} target="_blank" rel="noopener"
                  className="block px-4 py-3 active:bg-accent/40">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-base font-semibold">{formatPrice(u.price_monthly)}</span>
                    <span className="text-xs text-muted-foreground">#{u.unit ?? "—"}</span>
                  </div>
                  {eff && eff !== u.price_monthly && (
                    <div className="text-xs font-medium text-green-700">
                      净租金 {formatPrice(eff)}/月
                    </div>
                  )}
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {formatBeds(u.bedrooms)}
                    {u.bathrooms ? ` · ${formatBaths(u.bathrooms)}` : ""}
                    {u.sqft ? ` · ${formatSqft(u.sqft)}` : ""}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span>入住 {formatDate(u.available_at)}</span>
                    {u.months_free ? <span>· {u.months_free} 月免租</span> : null}
                    {u.lease_term_months ? <span>· 签 {u.lease_term_months} 月</span> : null}
                    {u.no_fee ? <span>· 免中介费</span> : null}
                  </div>
                </a>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
