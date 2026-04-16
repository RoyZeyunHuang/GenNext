"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, MapPin, ArrowUpDown } from "lucide-react";
import { AREAS } from "@/lib/apartments/hot_buildings";

const DEFAULT_SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "default", label: "推荐" },
  { value: "match", label: "匹配度" },
  { value: "newest", label: "最新" },
  { value: "available", label: "可租多" },
  { value: "price_low", label: "价低" },
  { value: "promo", label: "优惠多" },
];

/**
 * Compact filter row used at the top of both 楼盘 and 房源 views.
 * Two native-select dropdown chips: 区域 + 排序.
 *
 * The buildings page passes the default sort options; the units page
 * passes its own list (and a different "implicit default" value for
 * stripping the sort param from URLs).
 */
export function PreviewFilterRow({
  currentArea,
  currentSort,
  briefActive = false,
  sortOptions = DEFAULT_SORT_OPTIONS,
  /** Sort values that should be omitted from the URL (i.e. they map back
   *  to the page's natural default). Defaults to the buildings-page set. */
  clearSortOnValues = ["default", "match"],
}: {
  currentArea: string;
  currentSort: string;
  briefActive?: boolean;
  sortOptions?: Array<{ value: string; label: string }>;
  clearSortOnValues?: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`?${next.toString()}`);
  }

  const visibleSort = sortOptions.filter(
    (o) => o.value !== "match" || briefActive,
  );

  return (
    <div className="flex items-center gap-2">
      <SelectChip
        icon={<MapPin className="h-3.5 w-3.5" />}
        value={currentArea}
        onChange={(v) => update({ area: v === "all" ? null : v })}
        options={AREAS.map((a) => ({ value: a.value, label: a.label }))}
      />
      <SelectChip
        icon={<ArrowUpDown className="h-3.5 w-3.5" />}
        value={currentSort}
        onChange={(v) =>
          update({ sort: clearSortOnValues.includes(v) ? null : v })
        }
        options={visibleSort}
      />
    </div>
  );
}

/**
 * Visually a chip / pill, but the underlying control is a native <select>
 * for proper mobile UX (full-screen picker, hardware keyboard nav, etc.).
 * The label text is rendered in front so we get full control of typography.
 */
function SelectChip({
  icon,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const current =
    options.find((o) => o.value === value)?.label ?? options[0]?.label ?? "";
  return (
    <label className="relative inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm ring-1 ring-black/[0.02] hover:bg-accent">
      <span className="flex-shrink-0 text-muted-foreground">{icon}</span>
      <span className="whitespace-nowrap">{current}</span>
      <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={current}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
