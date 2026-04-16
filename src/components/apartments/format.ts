/** Shared formatters for apartment UI. */

export function formatPrice(p: number | null): string {
  if (p == null) return "—";
  return `$${p.toLocaleString()}`;
}

export function formatBeds(b: number | null): string {
  if (b == null) return "—";
  if (b === 0) return "Studio";
  if (b === Math.floor(b)) return `${b}BR`;
  return `${b}BR`;
}

export function formatBaths(b: number | null): string {
  if (b == null) return "";
  if (b === Math.floor(b)) return `${b} BA`;
  return `${b} BA`;
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
  if (secs < 0 || secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function areaLabel(a: string | null | undefined): string {
  const map: Record<string, string> = {
    lic: "LIC",
    queens: "Queens",
    manhattan: "Manhattan",
    brooklyn: "Brooklyn",
    jersey_city: "Jersey City",
  };
  return map[a ?? ""] ?? (a ?? "");
}

export function tagColor(tag: string | null | undefined): string {
  switch (tag) {
    case "new_2026":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "new_2025":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "new_2024":
      return "bg-yellow-50 text-yellow-800 ring-yellow-200";
    case "new_2023":
      return "bg-yellow-50 text-yellow-700 ring-yellow-200";
    case "core":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    case "legacy":
      return "bg-slate-100 text-slate-700 ring-slate-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}
