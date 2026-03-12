"use client";

import { useState } from "react";
import { Building2, Factory, Phone, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PropertiesTab } from "./PropertiesTab";
import { CompaniesTab } from "./CompaniesTab";
import { OutreachTab } from "./OutreachTab";
import { PipelineTab } from "./PipelineTab";

const TABS = [
  { key: "properties", label: "楼盘", icon: Building2 },
  { key: "companies", label: "公司", icon: Factory },
  { key: "outreach", label: "外联追踪", icon: Phone },
  { key: "pipeline", label: "Pipeline", icon: BarChart3 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function CrmClient() {
  const [tab, setTab] = useState<TabKey>("properties");
  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-[#E7E5E4]">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                tab === t.key
                  ? "border-[#1C1917] text-[#1C1917]"
                  : "border-transparent text-[#78716C] hover:text-[#1C1917]"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
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
