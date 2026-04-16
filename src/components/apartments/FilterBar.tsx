"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { NYC_CAMPUSES } from "@/lib/apartments/constants";

const BEDS_OPTIONS = [
  { value: "0", label: "开间" },
  { value: "1", label: "1卧" },
  { value: "2", label: "2卧" },
  { value: "3", label: "3卧" },
  { value: "4", label: "4卧+" },
];

const COMMUTE_PRESETS = [
  { value: "15", label: "≤15 分钟" },
  { value: "20", label: "≤20 分钟" },
  { value: "30", label: "≤30 分钟" },
  { value: "45", label: "≤45 分钟" },
];

export function FilterBar() {
  const router = useRouter();
  const sp = useSearchParams();

  const [beds, setBeds] = useState<Set<string>>(new Set());
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [noFee, setNoFee] = useState(false);
  const [moveInAfter, setMoveInAfter] = useState("");
  const [moveInBefore, setMoveInBefore] = useState("");
  const [sort, setSort] = useState("newest");
  const [school, setSchool] = useState("");
  const [maxCommute, setMaxCommute] = useState("");

  // Hydrate from URL
  useEffect(() => {
    setBeds(new Set((sp.get("beds") ?? "").split(",").filter(Boolean)));
    setMinPrice(sp.get("min_price") ?? "");
    setMaxPrice(sp.get("max_price") ?? "");
    setNoFee(sp.get("no_fee") === "1");
    setMoveInAfter(sp.get("move_in_after") ?? "");
    setMoveInBefore(sp.get("move_in_before") ?? "");
    setSort(sp.get("sort") ?? "newest");
    setSchool(sp.get("school") ?? "");
    setMaxCommute(sp.get("max_commute") ?? "");
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

  const hasFilters =
    beds.size > 0 || minPrice || maxPrice || noFee || moveInAfter ||
    moveInBefore || sort !== "newest" || school || maxCommute;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3 text-sm md:gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">户型</label>
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
        <label className="text-xs font-medium text-muted-foreground">最低价</label>
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
        <label className="text-xs font-medium text-muted-foreground">最高价</label>
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
        <label className="text-xs font-medium text-muted-foreground">入住时间</label>
        <div className="flex items-center gap-1">
          <input
            type="date"
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            value={moveInAfter}
            onChange={(e) => {
              setMoveInAfter(e.target.value);
              push({ move_in_after: e.target.value || null });
            }}
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            value={moveInBefore}
            onChange={(e) => {
              setMoveInBefore(e.target.value);
              push({ move_in_before: e.target.value || null });
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">通勤至</label>
        <div className="flex items-center gap-1">
          <select
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            value={school}
            onChange={(e) => {
              setSchool(e.target.value);
              push({ school: e.target.value || null });
            }}
          >
            <option value="">— 选择学校 —</option>
            {NYC_CAMPUSES.map((c) => (
              <option key={c.shortName} value={c.shortName}>{c.shortName}</option>
            ))}
          </select>
          <select
            disabled={!school}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-40"
            value={maxCommute}
            onChange={(e) => {
              setMaxCommute(e.target.value);
              push({ max_commute: e.target.value || null });
            }}
          >
            <option value="">不限</option>
            {COMMUTE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
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
        免中介费
      </label>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">排序</label>
        <select
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            push({ sort: e.target.value === "newest" ? null : e.target.value });
          }}
        >
          <option value="newest">最新优先</option>
          <option value="price_asc">价格 低 → 高</option>
          <option value="price_desc">价格 高 → 低</option>
          <option value="move_in">入住 由近到远</option>
          <option value="eff_rent_asc">净租金 低 → 高</option>
        </select>
      </div>

      {hasFilters && (
        <button
          onClick={() =>
            router.push(sp.get("area") ? `?area=${sp.get("area")}` : "?")
          }
          className="self-end text-xs text-muted-foreground underline hover:text-foreground"
        >
          重置
        </button>
      )}
    </div>
  );
}
