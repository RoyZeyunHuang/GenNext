"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import {
  Copy,
  Star,
  Loader2,
  Sparkles,
  RefreshCw,
  FileText,
  BookOpen,
  ClipboardList,
  Drama,
  ChevronDown,
  X,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface BrandDoc { id: string; title: string; property_name?: string | null }
interface KnowledgeDoc { id: string; title: string; type?: string | null }
interface TaskTemplate { id: string; title: string; platform?: string | null }
interface PersonaTemplate { id: string; title: string; description?: string | null }
interface DetectedIntent {
  detected_property: string;
  detected_platform: string;
  suggested_brand_docs: string[];
  suggested_knowledge: string[];
  suggested_task_template: string | null;
  suggested_persona: string | null;
}
interface HistoryItem {
  id: string;
  user_input: string | null;
  platform: string | null;
  output: string | null;
  starred: boolean;
  created_at: string;
}

const PLATFORM_ICONS: Record<string, string> = {
  xiaohongshu: "📕",
  instagram: "📸",
  linkedin: "💼",
  video: "🎬",
  wechat: "💬",
  other: "📝",
};

export function CopywriterClient() {
  /* ─── All available options ─── */
  const [allBrandDocs, setAllBrandDocs] = useState<BrandDoc[]>([]);
  const [allKnowledgeDocs, setAllKnowledgeDocs] = useState<KnowledgeDoc[]>([]);
  const [allTaskTemplates, setAllTaskTemplates] = useState<TaskTemplate[]>([]);
  const [allPersonas, setAllPersonas] = useState<PersonaTemplate[]>([]);

  /* ─── User input ─── */
  const [userInput, setUserInput] = useState("");

  /* ─── Intent detection ─── */
  const [detecting, setDetecting] = useState(false);
  const [intent, setIntent] = useState<DetectedIntent | null>(null);

  /* ─── Selected context ─── */
  const [selectedBrandDocIds, setSelectedBrandDocIds] = useState<string[]>([]);
  const [selectedKnowledgeDocIds, setSelectedKnowledgeDocIds] = useState<string[]>([]);
  const [selectedTaskTemplateId, setSelectedTaskTemplateId] = useState<string | null>(null);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);

  /* ─── Generation ─── */
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [starred, setStarred] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  /* ─── Picker modals ─── */
  const [pickerType, setPickerType] = useState<"brand" | "knowledge" | "task" | "persona" | null>(null);

  /* ─── History ─── */
  const [history, setHistory] = useState<HistoryItem[]>([]);

  /* ─── Load catalogs ─── */
  useEffect(() => {
    Promise.all([
      fetch("/api/brand-docs").then((r) => r.json()),
      fetch("/api/knowledge-docs").then((r) => r.json()),
      fetch("/api/task-templates").then((r) => r.json()),
      fetch("/api/persona-templates").then((r) => r.json()),
      fetch("/api/generated-copies").then((r) => r.json()),
    ]).then(([bd, kd, tt, pt, hist]) => {
      setAllBrandDocs(Array.isArray(bd) ? bd : []);
      setAllKnowledgeDocs(Array.isArray(kd) ? kd : []);
      setAllTaskTemplates(Array.isArray(tt) ? tt : []);
      setAllPersonas(Array.isArray(pt) ? pt : []);
      setHistory(Array.isArray(hist) ? hist.slice(0, 10) : []);
    });
  }, []);

  /* ─── Detect intent ─── */
  const detectIntent = useCallback(async () => {
    if (!userInput.trim()) return;
    setDetecting(true);
    setIntent(null);
    setError(null);
    try {
      const res = await fetch("/api/ai/detect-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_input: userInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "意图分析失败");
      setIntent(data);
      setSelectedBrandDocIds(data.suggested_brand_docs || []);
      setSelectedKnowledgeDocIds(data.suggested_knowledge || []);
      setSelectedTaskTemplateId(data.suggested_task_template || null);
      setSelectedPersonaId(data.suggested_persona || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "意图分析失败");
    } finally {
      setDetecting(false);
    }
  }, [userInput]);

  /* ─── Generate ─── */
  const generate = useCallback(async () => {
    setGenerating(true);
    setOutput("");
    setError(null);
    setStarred(false);
    setCopied(false);

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_doc_ids: selectedBrandDocIds,
          knowledge_doc_ids: selectedKnowledgeDocIds,
          task_template_id: selectedTaskTemplateId,
          persona_template_id: selectedPersonaId,
          user_input: userInput,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无响应流");

      const decoder = new TextDecoder();
      let result = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        result += chunk;
        if (result.startsWith("ERROR: ")) {
          setError(result.slice(7));
          setOutput("");
          break;
        }
        flushSync(() => setOutput(result));
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }, [selectedBrandDocIds, selectedKnowledgeDocIds, selectedTaskTemplateId, selectedPersonaId, userInput]);

  /* ─── Actions ─── */
  const copyToClipboard = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStar = async () => {
    if (!output || starred) return;
    const task = allTaskTemplates.find((t) => t.id === selectedTaskTemplateId);
    await fetch("/api/generated-copies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_input: userInput,
        brand_doc_ids: selectedBrandDocIds,
        knowledge_doc_ids: selectedKnowledgeDocIds,
        task_template_id: selectedTaskTemplateId,
        persona_template_id: selectedPersonaId,
        detected_intent: intent,
        output,
        platform: task?.platform || intent?.detected_platform || null,
        starred: true,
      }),
    });
    setStarred(true);
    const histRes = await fetch("/api/generated-copies");
    const histData = await histRes.json();
    setHistory(Array.isArray(histData) ? histData.slice(0, 10) : []);
  };

  const regenerateWithNewPersona = () => {
    setPickerType("persona");
  };

  const regenerateWithNewTask = () => {
    setPickerType("task");
  };

  /* ─── Helpers ─── */
  const brandDocNames = (ids: string[]) => ids.map((id) => allBrandDocs.find((d) => d.id === id)?.title ?? "未知").join(", ");
  const knowledgeDocNames = (ids: string[]) => ids.map((id) => allKnowledgeDocs.find((d) => d.id === id)?.title ?? "未知").join(", ");
  const taskName = (id: string | null) => (id ? allTaskTemplates.find((t) => t.id === id)?.title : null) ?? "无";
  const personaName = (id: string | null) => (id ? allPersonas.find((p) => p.id === id)?.title : null) ?? "无";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* ═══ Left: Input + Context ═══ */}
      <div className="space-y-4">
        {/* Main input */}
        <div className="rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm">
          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="告诉我你想创作什么，例如：帮我写 Sven 的小红书，突出大窗户和地铁近"
            rows={4}
            className="w-full resize-none rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] px-4 py-3 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
          />
          <button
            type="button"
            onClick={detectIntent}
            disabled={detecting || !userInput.trim()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1C1917] py-2.5 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
          >
            {detecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                分析意图中…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                快速生成
              </>
            )}
          </button>
        </div>

        {/* Intent confirmation area */}
        {intent && (
          <div className="rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-medium text-[#1C1917]">AI 将使用：</h3>
            <div className="space-y-2.5">
              {/* Brand docs */}
              <ContextRow
                icon={<FileText className="h-4 w-4 text-blue-500" />}
                label="品牌档案"
                value={selectedBrandDocIds.length > 0 ? brandDocNames(selectedBrandDocIds) : "无"}
                onPick={() => setPickerType("brand")}
              />
              {/* Knowledge */}
              <ContextRow
                icon={<BookOpen className="h-4 w-4 text-purple-500" />}
                label="知识库"
                value={selectedKnowledgeDocIds.length > 0 ? knowledgeDocNames(selectedKnowledgeDocIds) : "无"}
                onPick={() => setPickerType("knowledge")}
              />
              {/* Task template */}
              <ContextRow
                icon={<ClipboardList className="h-4 w-4 text-green-500" />}
                label="任务模板"
                value={taskName(selectedTaskTemplateId)}
                onPick={() => setPickerType("task")}
              />
              {/* Persona */}
              <ContextRow
                icon={<Drama className="h-4 w-4 text-orange-500" />}
                label="人格模板"
                value={personaName(selectedPersonaId)}
                onPick={() => setPickerType("persona")}
              />
            </div>

            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1C1917] py-2.5 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  生成中…
                </>
              ) : (
                "生成"
              )}
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>

      {/* ═══ Right: Output + History ═══ */}
      <div className="space-y-4">
        {/* Output */}
        <div className="rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-[#1C1917]">生成结果</h3>
            {output && (
              <div className="flex gap-1">
                <button type="button" onClick={copyToClipboard} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]">
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "已复制" : "复制"}
                </button>
                <button type="button" onClick={handleStar} className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-[#F5F5F4]", starred ? "text-amber-600" : "text-[#78716C] hover:text-[#1C1917]")}>
                  <Star className={cn("h-3.5 w-3.5", starred && "fill-current")} />
                  {starred ? "已收藏" : "收藏"}
                </button>
              </div>
            )}
          </div>
          <div
            ref={outputRef}
            className="min-h-[200px] max-h-[400px] overflow-y-auto rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-4 text-sm text-[#1C1917] whitespace-pre-wrap"
          >
            {output
              ? output
              : generating
                ? "..."
                : "生成结果将显示在此处"}
          </div>

          {output && !generating && (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={regenerateWithNewPersona} className="flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-xs text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]">
                <RefreshCw className="h-3.5 w-3.5" />
                换个风格
              </button>
              <button type="button" onClick={regenerateWithNewTask} className="flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-xs text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]">
                <RefreshCw className="h-3.5 w-3.5" />
                换个格式
              </button>
            </div>
          )}
        </div>

        {/* History */}
        <div className="rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-[#1C1917]">最近生成</h3>
          {history.length === 0 ? (
            <p className="text-xs text-[#A8A29E]">暂无记录</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-2 rounded-lg border border-[#E7E5E4] px-3 py-2">
                  <span className="shrink-0 text-base">{PLATFORM_ICONS[h.platform ?? "other"] ?? "📝"}</span>
                  <span className="flex-1 truncate text-xs text-[#1C1917]">{h.user_input || "无输入"}</span>
                  <span className="shrink-0 text-xs text-[#A8A29E]">
                    {new Date(h.created_at).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {h.starred && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Picker modal ═══ */}
      {pickerType && (
        <PickerModal
          type={pickerType}
          brandDocs={allBrandDocs}
          knowledgeDocs={allKnowledgeDocs}
          taskTemplates={allTaskTemplates}
          personas={allPersonas}
          selectedBrandDocIds={selectedBrandDocIds}
          selectedKnowledgeDocIds={selectedKnowledgeDocIds}
          selectedTaskTemplateId={selectedTaskTemplateId}
          selectedPersonaId={selectedPersonaId}
          onSelectBrandDocs={setSelectedBrandDocIds}
          onSelectKnowledgeDocs={setSelectedKnowledgeDocIds}
          onSelectTask={(id) => { setSelectedTaskTemplateId(id); if (output) generate(); }}
          onSelectPersona={(id) => { setSelectedPersonaId(id); if (output) generate(); }}
          onClose={() => setPickerType(null)}
        />
      )}
    </div>
  );
}

/* ─── Context row component ─── */
function ContextRow({
  icon,
  label,
  value,
  onPick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPick: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-[#FAFAF9] px-3 py-2">
      {icon}
      <span className="shrink-0 text-xs font-medium text-[#78716C]">{label}：</span>
      <span className="flex-1 truncate text-xs text-[#1C1917]">{value}</span>
      <button type="button" onClick={onPick} className="shrink-0 text-xs text-blue-600 hover:underline">
        换一个
      </button>
    </div>
  );
}

/* ─── Picker modal ─── */
function PickerModal({
  type,
  brandDocs,
  knowledgeDocs,
  taskTemplates,
  personas,
  selectedBrandDocIds,
  selectedKnowledgeDocIds,
  selectedTaskTemplateId,
  selectedPersonaId,
  onSelectBrandDocs,
  onSelectKnowledgeDocs,
  onSelectTask,
  onSelectPersona,
  onClose,
}: {
  type: "brand" | "knowledge" | "task" | "persona";
  brandDocs: BrandDoc[];
  knowledgeDocs: KnowledgeDoc[];
  taskTemplates: TaskTemplate[];
  personas: PersonaTemplate[];
  selectedBrandDocIds: string[];
  selectedKnowledgeDocIds: string[];
  selectedTaskTemplateId: string | null;
  selectedPersonaId: string | null;
  onSelectBrandDocs: (ids: string[]) => void;
  onSelectKnowledgeDocs: (ids: string[]) => void;
  onSelectTask: (id: string | null) => void;
  onSelectPersona: (id: string | null) => void;
  onClose: () => void;
}) {
  const titles: Record<string, string> = { brand: "选择品牌档案", knowledge: "选择知识库文档", task: "选择任务模板", persona: "选择人格模板" };

  const toggleBrand = (id: string) => {
    const next = selectedBrandDocIds.includes(id)
      ? selectedBrandDocIds.filter((x) => x !== id)
      : [...selectedBrandDocIds, id];
    onSelectBrandDocs(next);
  };

  const toggleKnowledge = (id: string) => {
    const next = selectedKnowledgeDocIds.includes(id)
      ? selectedKnowledgeDocIds.filter((x) => x !== id)
      : [...selectedKnowledgeDocIds, id];
    onSelectKnowledgeDocs(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-[#1C1917]">{titles[type]}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {type === "brand" && brandDocs.map((d) => (
            <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 hover:bg-[#F5F5F4]">
              <input type="checkbox" checked={selectedBrandDocIds.includes(d.id)} onChange={() => toggleBrand(d.id)} className="rounded border-[#E7E5E4]" />
              <span className="text-sm text-[#1C1917]">{d.title}</span>
              {d.property_name && <span className="text-xs text-[#A8A29E]">({d.property_name})</span>}
            </label>
          ))}
          {type === "knowledge" && knowledgeDocs.map((d) => (
            <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 hover:bg-[#F5F5F4]">
              <input type="checkbox" checked={selectedKnowledgeDocIds.includes(d.id)} onChange={() => toggleKnowledge(d.id)} className="rounded border-[#E7E5E4]" />
              <span className="text-sm text-[#1C1917]">{d.title}</span>
            </label>
          ))}
          {type === "task" && taskTemplates.map((t) => (
            <button key={t.id} type="button" onClick={() => { onSelectTask(t.id); onClose(); }} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F5F5F4]", selectedTaskTemplateId === t.id ? "bg-[#F5F5F4] font-medium text-[#1C1917]" : "text-[#78716C]")}>
              {t.title}
              {t.platform && <span className="text-xs text-[#A8A29E]">({t.platform})</span>}
            </button>
          ))}
          {type === "persona" && personas.map((p) => (
            <button key={p.id} type="button" onClick={() => { onSelectPersona(p.id); onClose(); }} className={cn("flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-[#F5F5F4]", selectedPersonaId === p.id ? "bg-[#F5F5F4]" : "")}>
              <span className={cn("text-sm", selectedPersonaId === p.id ? "font-medium text-[#1C1917]" : "text-[#78716C]")}>{p.title}</span>
              {p.description && <span className="text-xs text-[#A8A29E]">{p.description}</span>}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="h-8 rounded-lg bg-[#1C1917] px-4 text-xs font-medium text-white hover:bg-[#1C1917]/90">确定</button>
        </div>
      </div>
    </div>
  );
}
