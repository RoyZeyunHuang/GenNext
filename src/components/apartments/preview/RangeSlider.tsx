"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Dual-thumb range slider built on two stacked native `<input type="range">`.
 * - Local state tracks the live drag value
 * - `onCommit` only fires on mouse-up / touch-end / key-up, so we don't push
 *   to the URL on every pixel of motion
 * - `valueLabel` renders custom labels for each thumb (e.g. "1卧" instead
 *   of "1") so the same component works for prices and discrete categories
 */
export function RangeSlider({
  min,
  max,
  step = 1,
  value,
  onCommit,
  valueLabel,
  className,
}: {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onCommit: (next: [number, number]) => void;
  /** Optional formatter — defaults to String(v). Receives the numeric value. */
  valueLabel?: (v: number) => string;
  className?: string;
}) {
  const [local, setLocal] = useState<[number, number]>(value);

  // Re-sync if parent props change (e.g. URL change from elsewhere)
  useEffect(() => {
    setLocal(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value[0], value[1]]);

  const lo = Math.min(local[0], local[1]);
  const hi = Math.max(local[0], local[1]);
  const span = max - min;
  const leftPct = span > 0 ? ((lo - min) / span) * 100 : 0;
  const rightPct = span > 0 ? ((hi - min) / span) * 100 : 100;

  const fmt = valueLabel ?? ((v: number) => String(v));

  function handleMin(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Math.min(Number(e.target.value), local[1]);
    setLocal([v, local[1]]);
  }
  function handleMax(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Math.max(Number(e.target.value), local[0]);
    setLocal([local[0], v]);
  }
  function commit() {
    if (local[0] !== value[0] || local[1] !== value[1]) {
      onCommit([Math.min(local[0], local[1]), Math.max(local[0], local[1])]);
    }
  }

  // Tailwind arbitrary modifiers for thumb styling. The track is
  // pointer-events:none so users can only grab thumbs, not the track.
  const thumbClasses =
    "pointer-events-none absolute inset-x-0 top-0 h-7 w-full appearance-none bg-transparent " +
    "[&::-webkit-slider-thumb]:pointer-events-auto " +
    "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 " +
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-grab " +
    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 " +
    "[&::-webkit-slider-thumb]:border-foreground [&::-webkit-slider-thumb]:bg-background " +
    "[&::-webkit-slider-thumb]:shadow-md " +
    "[&::-webkit-slider-thumb]:active:cursor-grabbing " +
    "[&::-moz-range-thumb]:pointer-events-auto " +
    "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-grab " +
    "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 " +
    "[&::-moz-range-thumb]:border-foreground [&::-moz-range-thumb]:bg-background " +
    "[&::-moz-range-thumb]:shadow-md";

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs font-semibold tabular-nums">
        <span>{fmt(lo)}</span>
        <span className="text-muted-foreground">—</span>
        <span>{fmt(hi)}</span>
      </div>
      <div className="relative h-7">
        {/* Track background */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
        {/* Filled portion */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground"
          style={{ left: `${leftPct}%`, width: `${Math.max(0, rightPct - leftPct)}%` }}
        />
        {/* Min thumb — z-10 lower so right thumb stacks on top when overlapping */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={handleMin}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          className={cn(thumbClasses, "z-10")}
          aria-label="最小值"
        />
        {/* Max thumb */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={handleMax}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          className={cn(thumbClasses, "z-20")}
          aria-label="最大值"
        />
      </div>
    </div>
  );
}
