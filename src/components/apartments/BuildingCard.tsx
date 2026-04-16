import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { areaLabel, tagColor, shouldShowTag, tagLabel, effectiveBuildingImage } from "./format";
import { buildingLabels } from "@/lib/apartments/compute";
import { CompareToggle } from "./CompareBar";

interface Building {
  id: string;
  name: string;
  address: string | null;
  area: string;
  tag: string | null;
  image_url: string | null;
  active_rentals_count: number | null;
  open_rentals_count: number | null;
  closed_rentals_count: number | null;
  year_built: number | null;
  floor_count: number | null;
  unit_count: number | null;
  note: string | null;
  building_slug: string | null;
  amenities?: string[] | null;
  subways?: unknown;
  /** Optional unit photos from the building's listings, used to substitute
   *  for StreetEasy's "no photo" placeholder image. */
  fallback_image_urls?: Array<string | null> | null;
}

function safeSlug(building: Building): string {
  if (building.building_slug) return building.building_slug;
  // id might be a full URL like https://streeteasy.com/building/skyline-tower
  const m = building.id.match(/\/building\/(.+?)$/);
  if (m) return m[1];
  return encodeURIComponent(building.id);
}

export function BuildingCard({ building }: { building: Building }) {
  const available = building.open_rentals_count ?? building.active_rentals_count ?? 0;
  const heroImage = effectiveBuildingImage(building.image_url, building.fallback_image_urls ?? []);
  const labels = buildingLabels(
    {
      tag: building.tag as never,
      year_built: building.year_built,
      amenities: building.amenities ?? null,
      subways: (building.subways as never) ?? null,
      active_rentals_count: building.active_rentals_count,
      open_rentals_count: building.open_rentals_count,
    },
    [],
  );
  return (
    <Link
      href={`/apartments/buildings/${safeSlug(building)}`}
      className="group relative flex overflow-hidden rounded-lg border bg-card transition-shadow active:bg-accent/40 hover:shadow-md"
    >
      <CompareToggle id={building.id} />
      <div className="relative w-32 flex-shrink-0 self-stretch bg-muted sm:w-40">
        {heroImage ? (
          <Image
            src={heroImage}
            alt=""
            fill
            className="object-cover"
            unoptimized
            sizes="160px"
          />
        ) : (
          <div className="flex h-full min-h-[6rem] w-full items-center justify-center text-xs text-muted-foreground">
            暂无照片
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-semibold">{building.name}</span>
              {shouldShowTag(building.tag) && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1",
                    tagColor(building.tag)
                  )}
                >
                  {tagLabel(building.tag)}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {building.address} · {areaLabel(building.area)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-primary">{available}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              在租
            </div>
          </div>
        </div>
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {labels.slice(0, 4).map((l) => (
              <span
                key={l.id}
                title={l.tooltip}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium ring-1",
                  l.className,
                )}
              >
                {l.emoji} {l.short}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {building.year_built && <span>{building.year_built} 年建</span>}
          {building.floor_count && <span>{building.floor_count} 层</span>}
          {building.unit_count && <span>共 {building.unit_count} 套</span>}
          {building.closed_rentals_count != null && (
            <span>历史 {building.closed_rentals_count} 套</span>
          )}
        </div>
        {building.note && (
          <div className="line-clamp-1 text-xs italic text-muted-foreground">
            {building.note}
          </div>
        )}
      </div>
    </Link>
  );
}
