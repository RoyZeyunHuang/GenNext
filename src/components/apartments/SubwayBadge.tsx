import { cn } from "@/lib/utils";
import { subwayBg, subwayFg } from "@/lib/apartments/constants";

/**
 * NYC subway-line badge — colored circle with the route letter/number, MTA
 * style. Long codes (SIR, LIRR) widen to a pill.
 *
 * Accepts either a clean code ("F", "1", "NQRW") or a Google-Maps style
 * "F Line" string — we strip the suffix.
 */
export function SubwayBadge({
  route,
  size = "sm",
  className,
}: {
  route: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const code = normalizeRoute(route);
  if (!code) return null;
  const isLong = code.length > 1;

  const sizing =
    size === "xs"
      ? isLong ? "h-4 px-1.5 text-[9px]" : "h-4 w-4 text-[9px]"
      : size === "md"
      ? isLong ? "h-7 px-2.5 text-xs" : "h-7 w-7 text-sm"
      : isLong ? "h-5 px-2 text-[10px]" : "h-5 w-5 text-xs"; // sm default

  return (
    <span
      className={cn(
        "inline-flex flex-shrink-0 items-center justify-center rounded-full font-bold leading-none",
        sizing,
        className,
      )}
      style={{ backgroundColor: subwayBg(code), color: subwayFg(code) }}
      title={code}
    >
      {code}
    </span>
  );
}

/** Strip Google-Maps " Line" suffix and normalize to MTA code. */
function normalizeRoute(route: string | undefined | null): string {
  if (!route) return "";
  return route
    .replace(/\s*Line$/i, "")
    .replace(/\s*Train$/i, "")
    .trim()
    .toUpperCase();
}
