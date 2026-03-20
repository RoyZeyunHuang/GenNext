"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";

export function PlanningTabs({ planId }: { planId: string }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const base = `/planning/${planId}`;
  const tabs = [
    { path: `${base}/strategy`, labelKey: "planning.tabStrategy" },
    { path: `${base}/schedule`, labelKey: "planning.tabSchedule" },
    { path: `${base}/overview`, labelKey: "planning.tabOverview" },
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
      {tabs.map((tabItem) => (
        <Link
          key={tabItem.path}
          href={tabItem.path}
          className={cn(
            "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            pathname === tabItem.path
              ? "border-[#1C1917] text-[#1C1917]"
              : "border-transparent text-[#78716C] hover:text-[#1C1917]"
          )}
        >
          {t(tabItem.labelKey)}
        </Link>
      ))}
    </div>
  );
}
