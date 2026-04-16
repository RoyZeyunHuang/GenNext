"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GitCompare, X } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "themoniter_compare_ids";
const MAX = 4;

type Listener = (ids: string[]) => void;
const listeners: Set<Listener> = new Set();

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  listeners.forEach((cb) => cb(ids));
}

export function useCompareIds() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    setIds(readIds());
    const cb: Listener = (next) => setIds(next);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return {
    ids,
    has: (id: string) => ids.includes(id),
    toggle: (id: string) => {
      const cur = readIds();
      const next = cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= MAX
        ? cur
        : [...cur, id];
      writeIds(next);
    },
    clear: () => writeIds([]),
    max: MAX,
  };
}

/**
 * Floating bottom bar showing the current selection. Tap → /apartments/compare.
 */
export function CompareBar() {
  const { ids, clear } = useCompareIds();
  if (ids.length === 0) return null;
  const idsParam = ids.map(encodeURIComponent).join(",");
  return (
    <div className="fixed inset-x-0 bottom-3 z-50 flex justify-center px-3">
      <div className="flex w-full max-w-md items-center gap-2 rounded-full border bg-card px-3 py-2 shadow-lg">
        <span className="text-xs text-muted-foreground">
          已选 {ids.length} 栋
        </span>
        <button
          onClick={clear}
          className="rounded-full p-1 text-muted-foreground hover:bg-accent"
          aria-label="清空"
        >
          <X className="h-3 w-3" />
        </button>
        <Link
          href={`/apartments/compare?ids=${idsParam}`}
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90",
            ids.length < 2 && "pointer-events-none opacity-50",
          )}
        >
          <GitCompare className="h-3 w-3" />
          对比 ({ids.length})
        </Link>
      </div>
    </div>
  );
}

/**
 * Small ⊕/✓ checkbox-button to put on each building card. Stops link nav.
 */
export function CompareToggle({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const { has, toggle, ids, max } = useCompareIds();
  const checked = has(id);
  const disabled = !checked && ids.length >= max;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;
        toggle(id);
      }}
      disabled={disabled}
      title={
        disabled
          ? `最多对比 ${max} 栋`
          : checked
          ? "从对比中移除"
          : "加入对比"
      }
      className={cn(
        "absolute top-1.5 left-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold shadow-sm transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-white/95 text-muted-foreground hover:border-primary hover:text-primary",
        disabled && "cursor-not-allowed opacity-40",
        className,
      )}
    >
      {checked ? "✓" : "+"}
    </button>
  );
}
