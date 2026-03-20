"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Factory, Phone, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";
import { PropertiesTab } from "./PropertiesTab";
import { CompaniesTab } from "./CompaniesTab";
import { OutreachTab } from "./OutreachTab";
import { PipelineTab } from "./PipelineTab";

const TABS = [
  { key: "properties", labelKey: "crm.tabProperties", icon: Building2 },
  { key: "companies", labelKey: "crm.tabCompanies", icon: Factory },
  { key: "outreach", labelKey: "crm.tabOutreach", icon: Phone },
  { key: "pipeline", labelKey: "crm.tabPipeline", icon: BarChart3 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const TAB_KEYS: TabKey[] = ["properties", "companies", "outreach", "pipeline"];

export function CrmClient() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: TabKey =
    TAB_KEYS.includes(tabParam as TabKey) ? (tabParam as TabKey) : "properties";
  const [tab, setTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    if (TAB_KEYS.includes(tabParam as TabKey)) setTab(tabParam as TabKey);
  }, [tabParam]);
  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-[#E7E5E4]">
        {TABS.map((tabItem) => {
          const Icon = tabItem.icon;
          return (
            <button
              key={tabItem.key}
              type="button"
              onClick={() => {
                setTab(tabItem.key);
                const u = new URL(window.location.href);
                u.searchParams.set("tab", tabItem.key);
                window.history.replaceState({}, "", u.pathname + u.search);
              }}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                tab === tabItem.key
                  ? "border-[#1C1917] text-[#1C1917]"
                  : "border-transparent text-[#78716C] hover:text-[#1C1917]"
              )}
            >
              <Icon className="h-4 w-4" />
              {t(tabItem.labelKey)}
            </button>
          );
        })}
      </div>
      {tab === "properties" && <PropertiesTab />}
      {tab === "companies" && <CompaniesTab />}
      {tab === "outreach" && <OutreachTab />}
      {tab === "pipeline" && <PipelineTab />}
    </div>
  );
}
