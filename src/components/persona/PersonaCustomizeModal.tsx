"use client";

import { useState } from "react";
import { Loader2, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { PersonaAvatar } from "./PersonaAvatar";

type SourcePersona = {
  id: string;
  name: string;
  short_description: string | null;
  bio_md: string;
};

type ForkResult = {
  persona: {
    id: string;
    name: string;
    short_description: string;
    bio_md: string;
  };
  notes_copied: number;
};

export function PersonaCustomizeModal({
  source,
  onClose,
  onCreated,
}: {
  source: SourcePersona;
  onClose: () => void;
  onCreated: (result: ForkResult) => void;
}) {
  const [name, setName] = useState(source.name);
  const [customizations, setCustomizations] = useState("");
  const [bioExpanded, setBioExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("请填写名字");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/personas/fork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_persona_id: source.id,
          name: name.trim(),
          customizations: customizations.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onCreated(data as ForkResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E7E5E4] bg-white px-5 py-4">
          <h2 className="text-sm font-semibold text-[#1C1917]">
            基于 {source.name} 创建
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#A8A29E] hover:bg-[#F5F5F4] hover:text-[#1C1917]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Source preview */}
          <div className="flex items-start gap-3">
            <PersonaAvatar name={source.name} size={48} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#1C1917]">
                {source.name}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-[#78716C]">
                {source.short_description || "—"}
              </p>
            </div>
          </div>

          {/* Bio preview (collapsible) */}
          <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF9]/50">
            <button
              type="button"
              onClick={() => setBioExpanded((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
            >
              {bioExpanded ? (
                <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[#A8A29E]" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#A8A29E]" />
              )}
              <span className="text-xs font-medium text-[#78716C]">
                原始人设档案
              </span>
            </button>
            {bioExpanded && (
              <div className="border-t border-[#E7E5E4] px-3 py-3">
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-[#57534E]">
                  {source.bio_md || "（空档案）"}
                </pre>
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#78716C]">
              你的人设名字
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={source.name}
              className="h-10 w-full rounded-xl border border-[#E7E5E4] bg-white px-3 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:border-[#D6D3D1] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/15"
            />
            <p className="mt-1 text-[10px] text-[#A8A29E]">
              可以改名，也可以保留原名
            </p>
          </div>

          {/* Customizations */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#78716C]">
              让这个人设更像你
              <span className="ml-1 font-normal text-[#A8A29E]">（可选）</span>
            </label>
            <textarea
              value={customizations}
              onChange={(e) => setCustomizations(e.target.value)}
              rows={4}
              placeholder={"例如：\n· 内容领域改为咖啡探店和极简生活\n· 语气更随性一些，少用书面表达\n· 不要用「宝子们」这类称呼"}
              className="w-full rounded-xl border border-[#E7E5E4] bg-[#FAFAF9]/40 px-3 py-2.5 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:border-[#D6D3D1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1C1917]/15"
            />
            <p className="mt-1 text-[10px] text-[#A8A29E]">
              用自然语言描述你想调整的部分，AI 会帮你融合到人设档案中。不填则完全继承原始人设。
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-[#E7E5E4] bg-white px-5 py-4">
          <button
            type="button"
            disabled={submitting || !name.trim()}
            onClick={() => void handleSubmit()}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-white transition",
              submitting
                ? "bg-[#1C1917]/70"
                : "bg-[#1C1917] hover:bg-[#1C1917]/90",
              "disabled:opacity-50"
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {customizations.trim() ? "AI 正在定制你的人设…" : "正在创建…"}
              </>
            ) : (
              "创建我的人设"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
