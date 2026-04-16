"use client";

import Link from "next/link";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  areaLabel,
  formatAge,
  formatBaths,
  formatBeds,
  formatDate,
  formatPrice,
  formatSqft,
  tagColor,
} from "./format";

interface UnitRow {
  id: string;
  building_id: string | null;
  url: string;
  unit: string | null;
  address: string | null;
  neighborhood: string | null;
  price_monthly: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  no_fee: boolean;
  furnished: boolean;
  available_at: string | null;
  months_free: number | null;
  lease_term_months: number | null;
  image_url: string | null;
  first_seen_at: string;
  apt_buildings?: {
    name: string | null;
    tag: string | null;
    area: string | null;
    image_url: string | null;
  } | null;
}

export function UnitTable({ units }: { units: UnitRow[] }) {
  if (units.length === 0)
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        No units match your filters. Widen the criteria or wait for tomorrow&rsquo;s refresh.
      </div>
    );

  return (
    <>
    {/* Mobile: card list */}
    <div className="divide-y rounded-lg border bg-card md:hidden">
      {units.map((u) => {
        const b = u.apt_buildings;
        const img = u.image_url ?? b?.image_url ?? null;
        return (
          <Link key={u.id} href={`/apartments/units/${u.id}`}
            className="flex gap-3 p-3 active:bg-accent/40">
            <div className="h-20 w-24 flex-shrink-0 overflow-hidden rounded bg-muted">
              {img ? (
                <Image src={img} alt="" width={96} height={80} className="h-full w-full object-cover" unoptimized />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-base font-semibold">{formatPrice(u.price_monthly)}</span>
                <span className="text-xs text-muted-foreground">{formatAge(u.first_seen_at)}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {formatBeds(u.bedrooms)} · {formatBaths(u.bathrooms) || "—"}
                {u.sqft ? ` · ${formatSqft(u.sqft)}` : ""}
              </div>
              <div className="mt-0.5 truncate text-sm">
                <span className="font-medium">{b?.name ?? u.address}</span>
                {b?.tag && (
                  <span className={cn("ml-1.5 rounded px-1 py-0.5 text-[9px] font-semibold uppercase ring-1", tagColor(b.tag))}>
                    {b.tag.replace("_", " ")}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {u.unit ? `#${u.unit} · ` : ""}{areaLabel(b?.area)}
              </div>
            </div>
          </Link>
        );
      })}
    </div>

    {/* Desktop: table */}
    <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Price</th>
            <th className="px-3 py-2 text-left">Unit</th>
            <th className="px-3 py-2 text-left">Beds / Baths / Sqft</th>
            <th className="px-3 py-2 text-left">Building</th>
            <th className="px-3 py-2 text-left">Move-in</th>
            <th className="px-3 py-2 text-left">Concessions</th>
            <th className="px-3 py-2 text-left">First seen</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => {
            const b = u.apt_buildings;
            const img = u.image_url ?? b?.image_url ?? null;
            return (
              <tr
                key={u.id}
                className="border-b last:border-0 hover:bg-accent/40"
              >
                <td className="px-3 py-2 font-semibold text-foreground">
                  {formatPrice(u.price_monthly)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {img ? (
                      <Image
                        src={img}
                        alt=""
                        width={48}
                        height={36}
                        className="rounded object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="h-9 w-12 rounded bg-muted" />
                    )}
                    <span className="font-medium">{u.unit ?? "—"}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatBeds(u.bedrooms)} · {formatBaths(u.bathrooms) || "—"}{" "}
                  {u.sqft ? `· ${formatSqft(u.sqft)}` : ""}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/apartments/buildings/${u.building_id}`}
                      className="font-medium hover:underline"
                    >
                      {b?.name ?? u.address ?? "?"}
                    </Link>
                    {b?.tag && (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1",
                          tagColor(b.tag)
                        )}
                      >
                        {b.tag.replace("_", " ")}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {areaLabel(b?.area)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatDate(u.available_at)}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {u.months_free ? `${u.months_free} mo free` : ""}
                  {u.lease_term_months ? ` · ${u.lease_term_months}mo lease` : ""}
                  {u.no_fee ? " · No fee" : ""}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {formatAge(u.first_seen_at)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Link
                      href={`/apartments/units/${u.id}`}
                      className="rounded border px-2 py-1 text-xs hover:bg-accent"
                    >
                      Detail
                    </Link>
                    <a
                      href={u.url}
                      target="_blank"
                      rel="noopener"
                      className="rounded border px-2 py-1 text-xs hover:bg-accent"
                      title="Open on StreetEasy"
                    >
                      <ExternalLink className="inline h-3 w-3" />
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
