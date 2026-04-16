/** Shared formatters for apartment UI. */

export function formatPrice(p: number | null): string {
  if (p == null) return "—";
  return `$${p.toLocaleString()}`;
}

export function formatBeds(b: number | null): string {
  if (b == null) return "—";
  if (b === 0) return "开间";
  return `${b}卧`;
}

export function formatBaths(b: number | null): string {
  if (b == null) return "";
  return `${b}卫`;
}

export function formatSqft(s: number | null): string {
  if (s == null) return "";
  return `${s.toLocaleString()} ft²`;
}

export function formatAge(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const delta = Date.now() - t;
  const secs = Math.floor(delta / 1000);
  if (secs < 0 || secs < 60) return "刚刚";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const days = Math.floor(hrs / 24);
  return `${days} 天前`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function areaLabel(a: string | null | undefined): string {
  const map: Record<string, string> = {
    lic: "LIC",
    queens: "皇后区",
    manhattan: "曼哈顿",
    brooklyn: "布鲁克林",
    jersey_city: "新泽西城",
  };
  return map[a ?? ""] ?? (a ?? "");
}

export function tagColor(tag: string | null | undefined): string {
  switch (tag) {
    case "new_2026":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "new_2025":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

/** Should we render a tag badge at all? Only for genuinely new (2025+) buildings. */
export function shouldShowTag(tag: string | null | undefined): boolean {
  return tag === "new_2025" || tag === "new_2026";
}

/** Pretty label for tag badge. */
export function tagLabel(tag: string | null | undefined): string {
  if (tag === "new_2026") return "NEW 2026";
  if (tag === "new_2025") return "NEW 2025";
  return "";
}

/**
 * StreetEasy returns a "no_photo_building_wide" SVG placeholder when no real
 * photo exists. Treat it as if there were no image so callers can fall back
 * to a listing photo or render a friendlier placeholder.
 */
export function isPlaceholderImage(url: string | null | undefined): boolean {
  if (!url) return true;
  return url.includes("no_photo_building") || url.includes("no_photo_listing");
}

/** Resolve the best non-placeholder image for a building. */
export function effectiveBuildingImage(
  buildingImage: string | null | undefined,
  listingImages?: Array<string | null | undefined>,
): string | null {
  if (!isPlaceholderImage(buildingImage)) return buildingImage as string;
  for (const img of listingImages ?? []) {
    if (!isPlaceholderImage(img)) return img as string;
  }
  return null;
}
