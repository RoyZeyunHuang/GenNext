"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { UserRound, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { NYC_CAMPUSES } from "@/lib/apartments/constants";

const BEDS_OPTIONS = [
  { value: "0", label: "开间" },
  { value: "1", label: "1卧" },
  { value: "2", label: "2卧" },
  { value: "3", label: "3卧" },
  { value: "4", label: "4卧+" },
];

const BUDGET_PRESETS = [
  { value: "3000", label: "$3k" },
  { value: "4000", label: "$4k" },
  { value: "5000", label: "$5k" },
  { value: "6000", label: "$6k" },
  { value: "8000", label: "$8k" },
];

function bedLabel(v: string): string {
  return BEDS_OPTIONS.find((b) => b.value === v)?.label ?? v;
}
function budgetLabel(v: string): string {
  return BUDGET_PRESETS.find((b) => b.value === v)?.label ?? `$${v}`;
}

/**
 * Sticky filter bar where the agent enters the client's brief: school,
 * budget, beds, move-in. URL-driven so the agent can bookmark / share /
 * compare side-by-side. The page above re-ranks buildings by match score.
 *
 * Mobile: collapsed by default — shows a compact summary row that
 * expands inline when tapped. Auto-expands if fields are filled.
 * Desktop: always expanded (md and up).
 */
export function ClientBriefBar({ matchedCount }: { matchedCount?: number }) {
  const router = useRouter();
  const sp = useSearchParams();

  const [school, setSchool] = useState("");
  const [budget, setBudget] = useState("");
  const [beds, setBeds] = useState("");
  const [moveIn, setMoveIn] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const s = sp.get("school") ?? "";
    const bg = sp.get("budget") ?? "";
    const bd = sp.get("beds") ?? "";
    const mi = sp.get("move_in") ?? "";
    setSchool(s);
    setBudget(bg);
    setBeds(bd);
    setMoveIn(mi);
    // Auto-open on mobile if any value is set
    if (s || bg || bd || mi) setMobileOpen(true);
  }, [sp]);

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`?${next.toString()}`);
  }

  const isActive = !!(school || budget || beds || moveIn);
  const summaryChips: { key: string; label: string }[] = [];
  if (school) summaryChips.push({ key: "s", label: school });
  if (budget) summaryChips.push({ key: "bg", label: `≤${budgetLabel(budget)}` });
  if (beds) summaryChips.push({ key: "bd", label: bedLabel(beds) });
  if (moveIn) summaryChips.push({ key: "mi", label: `${moveIn} 前` });

  return (
    <div className="rounded-2xl border bg-gradient-to-r from-indigo-50/60 via-card to-card shadow-sm">
      {/* HEADER ROW — collapsed view on mobile is just this row.
       *  Use a div + role=button so we can nest the clear button inside without
       *  invalid HTML. The toggle is mobile-only; on md+ the form is always
       *  visible so clicking the header is a no-op. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setMobileOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setMobileOpen((v) => !v);
          }
        }}
        className="flex w-full items-center gap-2 p-3 md:pointer-events-none md:p-4"
        aria-expanded={mobileOpen}
      >
        <UserRound className="h-4 w-4 flex-shrink-0 text-indigo-600" />
        <h3 className="flex-shrink-0 text-sm font-semibold tracking-tight">
          客户需求
        </h3>

        {/* Mobile: compact summary chips when collapsed */}
        {!mobileOpen && summaryChips.length > 0 && (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto md:hidden">
            {summaryChips.map((c) => (
              <span
                key={c.key}
                className="flex-shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-900"
              >
                {c.label}
              </span>
            ))}
          </div>
        )}

        {/* Mobile: prompt when empty */}
        {!mobileOpen && summaryChips.length === 0 && (
          <span className="flex-1 truncate text-left text-[11px] text-muted-foreground md:hidden">
            点击填写,按匹配度排序
          </span>
        )}

        {/* Desktop: tagline always */}
        <span className="hidden text-[11px] text-muted-foreground md:inline">
          填写后,楼盘按匹配度自动排序
        </span>

        {isActive && matchedCount != null && (
          <span className="ml-auto flex-shrink-0 rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-bold text-indigo-900">
            匹配 {matchedCount}
          </span>
        )}

        {isActive && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(sp.get("area") ? `?area=${sp.get("area")}` : "?");
            }}
            className="pointer-events-auto flex-shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="清空需求"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Mobile chevron */}
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform md:hidden",
            mobileOpen && "rotate-180",
          )}
        />
      </div>

      {/* FORM — always rendered on desktop, toggled on mobile */}
      <div
        className={cn(
          "border-t border-current/5 px-3 pb-3 md:block md:px-4 md:pb-4",
          mobileOpen ? "block" : "hidden",
        )}
      >
        <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          {/* School */}
          <Field label="学校">
            <select
              value={school}
              onChange={(e) => {
                setSchool(e.target.value);
                push({ school: e.target.value || null });
              }}
              className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
            >
              <option value="">— 不限 —</option>
              {NYC_CAMPUSES.map((c) => (
                <option key={c.shortName} value={c.shortName}>
                  {c.shortName}
                </option>
              ))}
            </select>
          </Field>

          {/* Move-in (paired with school on sm grid for symmetry) */}
          <Field label="最晚入住">
            <input
              type="date"
              value={moveIn}
              onChange={(e) => {
                setMoveIn(e.target.value);
                push({ move_in: e.target.value || null });
              }}
              className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
            />
          </Field>

          {/* Budget — full width chip row that scrolls horizontally on tiny screens */}
          <Field label="预算上限" className="sm:col-span-2 lg:col-span-1">
            <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
              {BUDGET_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => push({ budget: budget === p.value ? null : p.value })}
                  className={cn(
                    "flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    budget === p.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Beds */}
          <Field label="户型" className="sm:col-span-2 lg:col-span-1">
            <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
              {BEDS_OPTIONS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => push({ beds: beds === b.value ? null : b.value })}
                  className={cn(
                    "flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    beds === b.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
