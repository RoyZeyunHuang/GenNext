import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ExternalLink, Phone, Calendar, Key, Zap } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/apartments/auth";
import { NotesPanel } from "@/components/apartments/NotesPanel";
import {
  areaLabel,
  formatBaths,
  formatBeds,
  formatDate,
  formatPrice,
  formatSqft,
  tagColor,
  shouldShowTag,
  tagLabel,
} from "@/components/apartments/format";
import { formatUnitSnippet } from "@/lib/apartments/wechat";
import { effectiveRent } from "@/lib/apartments/compute";
import { CopyButton } from "@/components/apartments/CopyButton";
import { SendToCopywriterButton } from "@/components/apartments/SendToCopywriterButton";
import type { Building, Listing, ListingNote } from "@/lib/apartments/types";
import { cn } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(id: string) {
  const db = getSupabaseAdmin();
  const { data: unit } = await db.from("apt_listings").select("*").eq("id", id).maybeSingle();
  if (!unit) return null;

  const [building, notes] = await Promise.all([
    unit.building_id
      ? db
          .from("apt_buildings")
          .select("*")
          .eq("id", unit.building_id)
          .maybeSingle()
          .then((r) => r.data as Building | null)
      : Promise.resolve(null),
    db
      .from("apt_listing_notes")
      .select("*")
      .eq("listing_id", id)
      .order("created_at", { ascending: false })
      .then((r) => r.data as ListingNote[] | null),
  ]);
  return { unit: unit as Listing, building, notes: notes ?? [] };
}

export default async function UnitDetailPage({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  const data = await load(id);
  if (!data) notFound();
  const { unit, building, notes } = data;
  const user = await getSessionUser();
  const eff = effectiveRent(unit.price_monthly, unit.months_free, unit.lease_term_months);
  const wechatText = formatUnitSnippet({
    unit,
    building,
    commutes: (building as unknown as { commutes?: never })?.commutes ?? null,
  });

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-4 lg:p-6">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link href="/apartments" className="hover:underline">
          公寓
        </Link>
        <span>/</span>
        {building && (
          <>
            <Link
              href={`/apartments/buildings/${building.building_slug ?? building.id}`}
              className="hover:underline"
            >
              {building.name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-foreground">户号 {unit.unit ?? unit.id}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Photos */}
        <div className="lg:col-span-2 space-y-4">
          {unit.image_url && (
            <div className="relative h-72 w-full overflow-hidden rounded-lg border bg-muted md:h-[420px]">
              <Image src={unit.image_url} alt="" fill className="object-cover" unoptimized sizes="800px" />
            </div>
          )}
          {unit.floor_plan_url && (
            <div className="relative h-64 w-full overflow-hidden rounded-lg border bg-white">
              <Image
                src={unit.floor_plan_url}
                alt="户型图"
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          )}
        </div>

        {/* Summary */}
        <aside className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-3xl font-bold">{formatPrice(unit.price_monthly)}</div>
            {eff && eff !== unit.price_monthly && (
              <div className="mt-1 text-sm font-medium text-green-700">
                净租金 {formatPrice(eff)}/月 · 省 {formatPrice(unit.price_monthly! - eff)}/月
              </div>
            )}
            <div className="mt-1 text-sm text-muted-foreground">
              {formatBeds(unit.bedrooms)} · {formatBaths(unit.bathrooms) || "—"}
              {unit.sqft ? ` · ${formatSqft(unit.sqft)}` : ""}
            </div>
            <div className="mt-2 text-sm font-medium">{unit.address}</div>
            {building && (
              <div className="mt-1 text-xs text-muted-foreground">
                所在楼盘:{" "}
                <Link
                  href={`/apartments/buildings/${building.building_slug ?? building.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {building.name}
                </Link>
                {shouldShowTag(building.tag) && (
                  <span
                    className={cn(
                      "ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1",
                      tagColor(building.tag)
                    )}
                  >
                    {tagLabel(building.tag)}
                  </span>
                )}
                <span className="ml-1">· {areaLabel(building.area)}</span>
              </div>
            )}

            <dl className="mt-4 divide-y text-sm">
              {unit.available_at && (
                <div className="flex items-center gap-2 py-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <dt className="text-muted-foreground">入住</dt>
                  <dd className="ml-auto font-medium">{formatDate(unit.available_at)}</dd>
                </div>
              )}
              {unit.lease_term_months && (
                <div className="flex items-center gap-2 py-1.5">
                  <Key className="h-3.5 w-3.5 text-muted-foreground" />
                  <dt className="text-muted-foreground">租期</dt>
                  <dd className="ml-auto font-medium">{unit.lease_term_months} 个月</dd>
                </div>
              )}
              {unit.months_free != null && unit.months_free > 0 && (
                <div className="flex items-center gap-2 py-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-600" />
                  <dt className="text-muted-foreground">优惠</dt>
                  <dd className="ml-auto font-medium text-amber-700">
                    {unit.months_free} 个月免租
                  </dd>
                </div>
              )}
              {unit.no_fee && (
                <div className="flex items-center gap-2 py-1.5">
                  <dt className="text-muted-foreground">免中介费</dt>
                  <dd className="ml-auto font-medium text-green-700">是</dd>
                </div>
              )}
              {unit.furnished && (
                <div className="flex items-center gap-2 py-1.5">
                  <dt className="text-muted-foreground">家具</dt>
                  <dd className="ml-auto font-medium">已配齐</dd>
                </div>
              )}
            </dl>

            <div className="mt-4 flex flex-col gap-2">
              <a
                href={unit.url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
              >
                <ExternalLink className="h-3.5 w-3.5" /> 在 StreetEasy 打开
              </a>
              {building?.leasing_phone && (
                <a
                  href={`tel:${building.leasing_phone}`}
                  className="inline-flex items-center justify-center gap-1 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent"
                >
                  <Phone className="h-3.5 w-3.5" /> {building.leasing_company ?? building.leasing_phone}
                </a>
              )}
              <CopyButton
                text={wechatText}
                label="📱 复制微信文案"
                copiedLabel="✓ 已复制"
                size="sm"
                className="px-3 py-2 text-sm"
              />
              <SendToCopywriterButton
                content={wechatText}
                label="→ 发送到文案工坊"
                className="px-3 py-2 text-sm"
              />
            </div>
          </div>

          <NotesPanel notes={notes} listingId={unit.id} currentUserId={user?.id} />
        </aside>
      </div>
    </div>
  );
}
