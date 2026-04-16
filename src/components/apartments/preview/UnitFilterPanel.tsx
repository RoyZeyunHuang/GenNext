"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Filter, X } from "lucide-react";
import { RangeSlider } from "./RangeSlider";

const BED_LABELS = ["开间", "1卧", "2卧", "3卧", "4卧+"];
const BED_MIN = 0;
const BED_MAX = 4;
const PRICE_MIN = 1500;
const PRICE_MAX = 15000;
const PRICE_STEP = 500;

function bedLabel(v: number): string {
  return BED_LABELS[Math.max(0, Math.min(BED_LABELS.length - 1, v))];
}

function priceLabel(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `$${v}`;
}

/**
 * Compact filter panel for the 房源 view: 户型 (bed range slider),
 * 价格 (price range slider), 入住前 (single date input).
 *
 * URL-driven, so filter state survives reload, share, view-toggle etc.
 * Defaults are "no filter" (full slider range, empty date) — when at
 * defaults, no params are written to the URL.
 */
export function UnitFilterPanel({ resultCount }: { resultCount?: number }) {
  const router = useRouter();
  const sp = useSearchParams();

  const [bedRange, setBedRange] = useState<[number, number]>([BED_MIN, BED_MAX]);
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_MIN, PRICE_MAX]);
  const [moveIn, setMoveIn] = useState("");

  // Hydrate from URL on each navigation
  useEffect(() => {
    const bMin = clamp(num(sp.get("beds_min"), BED_MIN), BED_MIN, BED_MAX);
    const bMax = clamp(num(sp.get("beds_max"), BED_MAX), BED_MIN, BED_MAX);
    const pMin = clamp(num(sp.get("min_price"), PRICE_MIN), PRICE_MIN, PRICE_MAX);
    const pMax = clamp(num(sp.get("max_price"), PRICE_MAX), PRICE_MIN, PRICE_MAX);
    setBedRange([bMin, bMax]);
    setPriceRange([pMin, pMax]);
    setMoveIn(sp.get("move_in") ?? "");
  }, [sp]);

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`?${next.toString()}`);
  }

  function commitBeds(next: [number, number]) {
    setBedRange(next);
    update({
      beds_min: next[0] === BED_MIN ? null : String(next[0]),
      beds_max: next[1] === BED_MAX ? null : String(next[1]),
    });
  }
  function commitPrice(next: [number, number]) {
    setPriceRange(next);
    update({
      min_price: next[0] === PRICE_MIN ? null : String(next[0]),
      max_price: next[1] === PRICE_MAX ? null : String(next[1]),
    });
  }
  function commitMoveIn(v: string) {
    setMoveIn(v);
    update({ move_in: v || null });
  }

  const isActive =
    bedRange[0] !== BED_MIN || bedRange[1] !== BED_MAX ||
    priceRange[0] !== PRICE_MIN || priceRange[1] !== PRICE_MAX ||
    moveIn !== "";

  function clearAll() {
    setBedRange([BED_MIN, BED_MAX]);
    setPriceRange([PRICE_MIN, PRICE_MAX]);
    setMoveIn("");
    const next = new URLSearchParams(sp.toString());
    ["beds_min", "beds_max", "min_price", "max_price", "move_in"].forEach((k) =>
      next.delete(k),
    );
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">筛选房源</h3>
        {resultCount != null && (
          <span className="text-[11px] text-muted-foreground">
            · 当前 <strong className="text-foreground">{resultCount}</strong> 套
          </span>
        )}
        {isActive && (
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto inline-flex items-center gap-1 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="清空筛选"
          >
            <X className="h-3.5 w-3.5" />
            <span className="text-[11px]">清空</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Beds slider */}
        <Field label="户型">
          <RangeSlider
            min={BED_MIN}
            max={BED_MAX}
            step={1}
            value={bedRange}
            onCommit={commitBeds}
            valueLabel={(v) => bedLabel(v)}
          />
        </Field>

        {/* Price slider */}
        <Field label="预算 (月租)">
          <RangeSlider
            min={PRICE_MIN}
            max={PRICE_MAX}
            step={PRICE_STEP}
            value={priceRange}
            onCommit={commitPrice}
            valueLabel={priceLabel}
          />
        </Field>

        {/* Move-in date — single input */}
        <Field label="入住前">
          <input
            type="date"
            value={moveIn}
            onChange={(e) => commitMoveIn(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function num(s: string | null, fallback: number): number {
  if (!s) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
