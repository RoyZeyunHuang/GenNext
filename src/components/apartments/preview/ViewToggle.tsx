import Link from "next/link";
import { Building2, BedDouble } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Segmented control for switching between Building view (default
 * `/apartments`) and Apartment / unit view (`/apartments/units`).
 *
 * Visual-only "toggle" — each side is a real `<Link>`, so URL state and
 * back/forward both Just Work. Pure server component.
 */
export function ViewToggle({
  current,
  /** When provided, preserves the current query params on the new route. */
  searchParamsString,
  /** Route prefix. "/apartments" for the main app, or e.g.
   *  "/rednote-factory/apartments" for the RF shell. Trailing slash stripped. */
  basePath = "/apartments",
}: {
  current: "buildings" | "units";
  searchParamsString?: string;
  basePath?: string;
}) {
  const qs = searchParamsString ? `?${searchParamsString}` : "";
  const prefix = basePath.replace(/\/$/, "");
  return (
    <div
      className="inline-flex flex-shrink-0 items-center rounded-full border border-border bg-background p-0.5 shadow-sm ring-1 ring-black/[0.02]"
      role="tablist"
      aria-label="视图切换"
    >
      <ToggleItem
        href={`${prefix}${qs}`}
        active={current === "buildings"}
        icon={<Building2 className="h-3.5 w-3.5" />}
        label="楼盘"
      />
      <ToggleItem
        href={`${prefix}/units${qs}`}
        active={current === "units"}
        icon={<BedDouble className="h-3.5 w-3.5" />}
        label="房源"
      />
    </div>
  );
}

function ToggleItem({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
