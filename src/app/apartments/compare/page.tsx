import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { CompareSchoolPicker } from "@/components/apartments/CompareSchoolPicker";
import { CompareCopyButton } from "@/components/apartments/CompareCopyButton";
import {
  AMENITY_LABELS, AMENITY_CATEGORIES,
  subwayBg, subwayFg,
  NYC_CAMPUSES,
} from "@/lib/apartments/constants";
import { effectiveRent, medianPriceByBeds } from "@/lib/apartments/compute";
import { areaLabel, formatPrice, tagColor, shouldShowTag, tagLabel } from "@/components/apartments/format";
import { cn } from "@/lib/utils";
import type { Building, Listing } from "@/lib/apartments/types";
import type { CommuteResult } from "@/lib/apartments/commute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "对比 · 公寓" };

type SP = { [k: string]: string | string[] | undefined };

interface BuildingFull extends Building {
  commutes?: CommuteResult[] | null;
}

async function load(idsParam: string) {
  const ids = idsParam.split(",").map((s) => decodeURIComponent(s.trim())).filter(Boolean).slice(0, 4);
  if (ids.length === 0) return { buildings: [], listings: new Map<string, Listing[]>() };
  const db = getSupabaseAdmin();
  const [{ data: buildings }, { data: listings }] = await Promise.all([
    db.from("apt_buildings").select("*").in("id", ids),
    db.from("apt_listings").select("*").in("building_id", ids).eq("is_active", true),
  ]);
  const orderMap = new Map(ids.map((id, i) => [id, i]));
  const ordered = (buildings ?? []).slice().sort((a: { id: string }, b: { id: string }) =>
    (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99)
  );
  const byBuilding = new Map<string, Listing[]>();
  for (const l of listings ?? []) {
    if (!l.building_id) continue;
    const arr = byBuilding.get(l.building_id) ?? [];
    arr.push(l as Listing);
    byBuilding.set(l.building_id, arr);
  }
  return { buildings: ordered as BuildingFull[], listings: byBuilding };
}

function commuteFor(b: BuildingFull, schoolShort: string): CommuteResult | undefined {
  return (b.commutes ?? []).find((c) => c.campusShortName === schoolShort);
}

function bestIndex<T>(values: Array<T | null | undefined>, lowerIsBetter: boolean): Set<number> {
  const filtered = values
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v != null);
  if (filtered.length === 0) return new Set();
  filtered.sort((a, b) => {
    const av = a.v as unknown as number;
    const bv = b.v as unknown as number;
    return lowerIsBetter ? av - bv : bv - av;
  });
  const bestVal = filtered[0].v;
  return new Set(filtered.filter((x) => x.v === bestVal).map((x) => x.i));
}

function Cell({ best, children }: { best?: boolean; children: React.ReactNode }) {
  return (
    <td className={cn("border-l px-3 py-2 align-top text-sm", best && "bg-green-50")}>
      {children}
    </td>
  );
}

export default async function ComparePage({ searchParams }: { searchParams: SP }) {
  const idsParam = (searchParams.ids as string) ?? "";
  const school = (searchParams.school as string) ?? "NYU WSQ";
  const { buildings, listings } = await load(idsParam);

  if (buildings.length < 2) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Link href="/apartments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> 返回
        </Link>
        <div className="mt-6 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          请到楼盘列表选择至少 2 栋楼(点卡片左上角的 ⊕),再回到这里查看对比。
        </div>
      </div>
    );
  }

  // Per-building computed metrics
  const metrics = buildings.map((b) => {
    const ls = listings.get(b.id) ?? [];
    const med = medianPriceByBeds(ls);
    const minPrice = ls.reduce((m, l) => Math.min(m, l.price_monthly ?? Infinity), Infinity);
    const minEff = ls.reduce((m, l) => {
      const e = effectiveRent(l.price_monthly, l.months_free, l.lease_term_months);
      return Math.min(m, e ?? Infinity);
    }, Infinity);
    const maxConcession = ls.reduce((m, l) => Math.max(m, l.months_free ?? 0), 0);
    const cm = commuteFor(b, school);
    return {
      b, ls, med,
      minPrice: minPrice === Infinity ? null : minPrice,
      minEff: minEff === Infinity ? null : minEff,
      maxConcession,
      commute: cm,
    };
  });

  // "Best" highlights per row
  const bestMinPrice = bestIndex(metrics.map((m) => m.minPrice), true);
  const bestMinEff = bestIndex(metrics.map((m) => m.minEff), true);
  const bestCommute = bestIndex(metrics.map((m) => m.commute?.transit?.durationMinutes ?? null), true);
  const bestConcession = bestIndex(metrics.map((m) => m.maxConcession), false);
  const bestAvail = bestIndex(metrics.map((m) => (m.b.open_rentals_count ?? m.b.active_rentals_count ?? 0)), false);
  const bestNew = bestIndex(metrics.map((m) => m.b.year_built), false);

  // Amenities matrix: columns=buildings, rows=amenity ids in order
  const amenityIds = Array.from(new Set(buildings.flatMap((b) => b.amenities ?? [])));
  const orderedAmenities = ([] as string[]).concat(
    ...Object.values(AMENITY_CATEGORIES).map((cat) => cat.filter((id) => amenityIds.includes(id))),
  );
  const remainingAmenities = amenityIds.filter((id) => !orderedAmenities.includes(id));

  const compareSchoolName = NYC_CAMPUSES.find((c) => c.shortName === school)?.name ?? school;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-3 py-4 lg:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">对比 {buildings.length} 栋楼</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            每行最优项以绿色高亮。通勤参考学校:{" "}
            <strong className="text-foreground">{compareSchoolName}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CompareSchoolPicker current={school} />
          <CompareCopyButton
            buildings={buildings}
            metrics={metrics.map((m) => ({
              buildingId: m.b.id,
              minPrice: m.minPrice,
              minEff: m.minEff,
              maxConcession: m.maxConcession,
              commuteMinutes: m.commute?.transit?.durationMinutes ?? null,
              commuteLines: m.commute?.transit?.lines ?? [],
              available: m.b.open_rentals_count ?? m.b.active_rentals_count ?? 0,
            }))}
            schoolShort={school}
          />
          <Link href="/apartments" className="rounded border px-3 py-1.5 text-xs hover:bg-accent">
            ← 返回
          </Link>
        </div>
      </header>

      {/* Comparison table */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          {/* Building headers */}
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="w-44 px-3 py-3 text-left text-xs uppercase text-muted-foreground"></th>
              {buildings.map((b) => (
                <th key={b.id} className="border-l px-3 py-3 text-left">
                  <div className="flex items-start gap-2">
                    {b.image_url && (
                      <Image src={b.image_url} alt="" width={56} height={42}
                        className="rounded object-cover" unoptimized />
                    )}
                    <div className="min-w-0">
                      <Link href={`/apartments/buildings/${b.building_slug ?? b.id}`}
                        className="block font-semibold hover:underline">
                        {b.name}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">
                        {b.address} · {areaLabel(b.area)}
                      </div>
                      {shouldShowTag(b.tag) && (
                        <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1", tagColor(b.tag))}>
                          {tagLabel(b.tag)}
                        </span>
                      )}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Year built */}
            <tr className="border-b">
              <th className="bg-muted/20 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">建成年份</th>
              {metrics.map((m, i) => (
                <Cell key={i} best={bestNew.has(i)}>{m.b.year_built ?? "—"}</Cell>
              ))}
            </tr>
            {/* Floors / units */}
            <tr className="border-b">
              <th className="bg-muted/20 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">规模</th>
              {metrics.map((m, i) => (
                <Cell key={i}>
                  {m.b.floor_count ?? "—"} 层 · 共 {m.b.unit_count?.toLocaleString() ?? "—"} 套
                </Cell>
              ))}
            </tr>
            {/* Available count */}
            <tr className="border-b">
              <th className="bg-muted/20 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">在租</th>
              {metrics.map((m, i) => (
                <Cell key={i} best={bestAvail.has(i)}>
                  <span className="font-semibold text-primary">{m.b.open_rentals_count ?? m.b.active_rentals_count ?? 0}</span>
                </Cell>
              ))}
            </tr>
            {/* Min asking price */}
            <tr className="border-b">
              <th className="bg-muted/20 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">最低标价</th>
              {metrics.map((m, i) => (
                <Cell key={i} best={bestMinPrice.has(i)}>
                  {m.minPrice ? <span className="font-semibold">{formatPrice(m.minPrice)}</span> : "—"}
                </Cell>
              ))}
            </tr>
            {/* Min effective */}
            <tr className="border-b">
              <th className="bg-muted/20 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">最低净租金</th>
              {metrics.map((m, i) => (
                <Cell key={i} best={bestMinEff.has(i)}>
                  {m.minEff ? <span className="font-semibold text-green-700">{formatPrice(m.minEff)}</span> : "—"}
                </Cell>
              ))}
            </tr>
            {/* Median by beds */}
            {["0", "1", "2", "3"].map((bed) => {
              const hasAny = metrics.some((m) => m.med[bed]);
              if (!hasAny) return null;
              const label = bed === "0" ? "开间中位价" : `${bed}卧中位价`;
              return (
                <tr key={bed} className="border-b">
                  <th className="bg-muted/20 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">{label}</th>
                  {metrics.map((m, i) => (
                    <Cell key={i}>
                      {m.med[bed] ? formatPrice(m.med[bed]) : "—"}
                    </Cell>
                  ))}
                </tr>
              );
            })}
            {/* Best concession */}
            <tr className="border-b">
              <th className="bg-muted/20 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">最高优惠</th>
              {metrics.map((m, i) => (
                <Cell key={i} best={bestConcession.has(i) && m.maxConcession > 0}>
                  {m.maxConcession > 0 ? `${m.maxConcession} 个月免租` : "—"}
                </Cell>
              ))}
            </tr>
            {/* Commute to selected school */}
            <tr className="border-b">
              <th className="bg-muted/20 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                → {school}
              </th>
              {metrics.map((m, i) => {
                const c = m.commute;
                const transit = c?.transit;
                return (
                  <Cell key={i} best={bestCommute.has(i)}>
                    {transit ? (
                      <div>
                        <div className="font-semibold">{transit.durationMinutes} 分钟</div>
                        {transit.lines.length > 0 && (
                          <div className="mt-1 flex items-center gap-1">
                            {transit.lines.map((line, idx) => (
                              <span key={idx} className="flex items-center gap-1">
                                {idx > 0 && <span className="text-xs text-muted-foreground">→</span>}
                                <span
                                  className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold"
                                  style={{ backgroundColor: subwayBg(line), color: subwayFg(line) }}
                                >
                                  {line}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-1 text-xs text-muted-foreground">
                          {c.walking?.durationMinutes ? `🚶 ${c.walking.durationMinutes} 分钟 · ` : ""}
                          {c.driving?.durationMinutes ? `🚗 ${c.driving.durationMinutes} 分钟` : ""}
                        </div>
                      </div>
                    ) : "—"}
                  </Cell>
                );
              })}
            </tr>
            {/* Leasing company */}
            <tr className="border-b">
              <th className="bg-muted/20 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">租赁方</th>
              {metrics.map((m, i) => (
                <Cell key={i}>
                  {m.b.leasing_company ?? "—"}
                  {m.b.leasing_phone && (
                    <div className="text-xs text-muted-foreground">{m.b.leasing_phone}</div>
                  )}
                </Cell>
              ))}
            </tr>
            {/* Amenities matrix */}
            {[...orderedAmenities, ...remainingAmenities].map((a) => (
              <tr key={a} className="border-b">
                <th className="bg-muted/20 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  {AMENITY_LABELS[a] ?? a.replaceAll("_", " ")}
                </th>
                {metrics.map((m, i) => (
                  <Cell key={i}>
                    {m.b.amenities?.includes(a) ? (
                      <span className="text-green-700">✓</span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </Cell>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        提示:每行高亮的单元格表示该维度上的最优项。点击「📋 复制对比」即可一键生成对比文案发给客户。
      </p>
    </div>
  );
}
