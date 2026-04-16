"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { AREAS } from "@/lib/apartments/hot_buildings";

export function AreaPills({
  current,
  basePath = "/apartments",
}: {
  current: string;
  basePath?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {AREAS.map((a) => {
        const active = a.value === current;
        const href = a.value === "all" ? basePath : `${basePath}?area=${a.value}`;
        return (
          <Link
            key={a.value}
            href={href}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
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
