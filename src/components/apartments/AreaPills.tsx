"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { AREAS } from "@/lib/apartments/hot_buildings";

export function AreaPills({
  current,
  basePath = "/apartments",
  nowrap = false,
}: {
  current: string;
  basePath?: string;
  /** When the parent provides horizontal scroll, set true so pills don't wrap. */
  nowrap?: boolean;
}) {
  return (
    <div className={cn("flex gap-2", nowrap ? "flex-nowrap" : "flex-wrap")}>
      {AREAS.map((a) => {
        const active = a.value === current;
        const href = a.value === "all" ? basePath : `${basePath}?area=${a.value}`;
        return (
          <Link
            key={a.value}
            href={href}
            className={cn(
              "inline-flex flex-shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {a.label}
          </Link>
        );
      })}
    </div>
  );
}
