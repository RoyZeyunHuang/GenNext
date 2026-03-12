"use client";

import { useState } from "react";
import { FileText, BookOpen, ClipboardList, Drama } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandDocsTab } from "./BrandDocsTab";
import { KnowledgeDocsTab } from "./KnowledgeDocsTab";
import { TaskTemplatesTab } from "./TaskTemplatesTab";
import { PersonaTemplatesTab } from "./PersonaTemplatesTab";

const TABS = [
  { key: "brand", label: "品牌档案", icon: FileText, emoji: "📋" },
  { key: "knowledge", label: "知识库", icon: BookOpen, emoji: "📚" },
  { key: "task", label: "任务模板", icon: ClipboardList, emoji: "📝" },
  { key: "persona", label: "人格模板", icon: Drama, emoji: "🎭" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ContentFactoryClient() {
  const [tab, setTab] = useState<TabKey>("brand");

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-[#E7E5E4]">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-[#1C1917] text-[#1C1917]"
                : "border-transparent text-[#78716C] hover:text-[#1C1917]"
            )}
          >
            <span>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "brand" && <BrandDocsTab />}
      {tab === "knowledge" && <KnowledgeDocsTab />}
      {tab === "task" && <TaskTemplatesTab />}
      {tab === "persona" && <PersonaTemplatesTab />}
    </div>
  );
}
