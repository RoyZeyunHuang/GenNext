"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const BEDS_OPTIONS = [
  { value: "0", label: "Studio" },
  { value: "1", label: "1BR" },
  { value: "2", label: "2BR" },
  { value: "3", label: "3BR" },
  { value: "4", label: "4BR+" },
];

export function FilterBar() {
  const router = useRouter();
  const sp = useSearchParams();

  const [beds, setBeds] = useState<Set<string>>(new Set());
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [noFee, setNoFee] = useState(false);
  const [moveIn, setMoveIn] = useState("");
  const [sort, setSort] = useState("newest");

  // Hydrate from URL
  useEffect(() => {
    setBeds(new Set((sp.get("beds") ?? "").split(",").filter(Boolean)));
    setMinPrice(sp.get("min_price") ?? "");
    setMaxPrice(sp.get("max_price") ?? "");
    setNoFee(sp.get("no_fee") === "1");
    setMoveIn(sp.get("move_in_after") ?? "");
    setSort(sp.get("sort") ?? "newest");
  }, [sp]);

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`?${next.toString()}`);
  }

  function toggleBed(v: string) {
    const n = new Set(beds);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    push({ beds: n.size === 0 ? null : Array.from(n).sort().join(",") });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3 text-sm md:gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Beds</label>
        <div className="flex gap-1">
          {BEDS_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => toggleBed(o.value)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                beds.has(o.value)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-accent"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Min price</label>
        <input
          type="number"
          inputMode="numeric"
          placeholder="2500"
          className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          onBlur={(e) => push({ min_price: e.target.value || null })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Max price</label>
        <input
          type="number"
          inputMode="numeric"
          placeholder="6000"
          className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          onBlur={(e) => push({ max_price: e.target.value || null })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Move-in after</label>
        <input
          type="date"
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={moveIn}
          onChange={(e) => {
            setMoveIn(e.target.value);
            push({ move_in_after: e.target.value || null });
          }}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={noFee}
          onChange={(e) => {
            setNoFee(e.target.checked);
            push({ no_fee: e.target.checked ? "1" : null });
          }}
        />
        No fee only
      </label>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Sort</label>
        <select
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            push({ sort: e.target.value === "newest" ? null : e.target.value });
          }}
        >
          <option value="newest">Newest first</option>
          <option value="price_asc">Price: low → high</option>
          <option value="price_desc">Price: high → low</option>
          <option value="move_in">Move-in: soonest</option>
        </select>
      </div>
      {(beds.size > 0 || minPrice || maxPrice || noFee || moveIn || sort !== "newest") && (
        <button
          onClick={() =>
            router.push(
              sp.get("area") ? `?area=${sp.get("area")}` : "?"
            )
          }
          className="self-end text-xs text-muted-foreground underline hover:text-foreground"
        >
          Reset
        </button>
      )}
    </div>
  );
}
