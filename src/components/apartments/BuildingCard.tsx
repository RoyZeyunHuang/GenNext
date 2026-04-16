import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { areaLabel, tagColor } from "./format";

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
  return (
    <Link
      href={`/apartments/buildings/${safeSlug(building)}`}
      className="group flex overflow-hidden rounded-lg border bg-card transition-shadow active:bg-accent/40 hover:shadow-md"
    >
      <div className="relative h-24 w-32 flex-shrink-0 bg-muted sm:h-28 sm:w-40">
        {building.image_url ? (
          <Image
            src={building.image_url}
            alt=""
            fill
            className="object-cover"
            unoptimized
            sizes="160px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            no photo
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-semibold">{building.name}</span>
              {building.tag && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1",
                    tagColor(building.tag)
                  )}
                >
                  {building.tag.replace("_", " ")}
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
              available
            </div>
          </div>
        </div>
        <div className="mt-auto flex flex-wrap gap-3 text-xs text-muted-foreground">
          {building.year_built && <span>Built {building.year_built}</span>}
          {building.floor_count && <span>{building.floor_count} fl</span>}
          {building.unit_count && <span>{building.unit_count} units</span>}
          {building.closed_rentals_count != null && (
            <span>{building.closed_rentals_count} closed</span>
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
