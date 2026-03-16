"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export function PlanningTabs({ planId }: { planId: string }) {
  const pathname = usePathname();
  const base = `/planning/${planId}`;
  const tabs = [
    { path: `${base}/strategy`, label: "策略" },
    { path: `${base}/schedule`, label: "排期" },
    { path: `${base}/overview`, label: "概览" },
  ];

  useEffect(() => {
    fetch(`/api/planning/${planId}`)
      .then((r) => r.json())
      .then((p) => {
        const el = document.getElementById("planning-breadcrumb-title");
        if (el && p.title) el.textContent = p.title;
      })
      .catch(() => {});
  }, [planId]);

  return (
    <div className="mb-6 flex gap-1 border-b border-[#E7E5E4]">
      {tabs.map((t) => (
        <Link
          key={t.path}
          href={t.path}
          className={cn(
            "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            pathname === t.path
              ? "border-[#1C1917] text-[#1C1917]"
              : "border-transparent text-[#78716C] hover:text-[#1C1917]"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
