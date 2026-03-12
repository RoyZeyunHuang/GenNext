"use client";

import { useState } from "react";
import { BarChart3, Award, Bot, FileText, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiOverviewTab } from "./KpiOverviewTab";
import { KpiBonusTab } from "./KpiBonusTab";
import { KpiAiTab } from "./KpiAiTab";
import { CampaignReportTab } from "./CampaignReportTab";
import { DataUploadTab } from "./DataUploadTab";

const TABS = [
  { key: "overview", label: "KPI Overview", icon: BarChart3 },
  { key: "bonus", label: "KPI Bonus", icon: Award },
  { key: "ai", label: "KPI AI", icon: Bot },
  { key: "campaign", label: "Campaign Report", icon: FileText },
  { key: "upload", label: "数据上传", icon: Upload },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function KpiClient() {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[#E7E5E4]">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                tab === t.key ? "border-[#1C1917] text-[#1C1917]" : "border-transparent text-[#78716C] hover:text-[#1C1917]"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "overview" && <KpiOverviewTab />}
      {tab === "bonus" && <KpiBonusTab />}
      {tab === "ai" && <KpiAiTab />}
      {tab === "campaign" && <CampaignReportTab />}
      {tab === "upload" && <DataUploadTab />}
    </div>
  );
}
