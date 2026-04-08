"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, ShieldAlert, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ARTICLE_LENGTH_SEGMENTED,
  DEFAULT_ARTICLE_LENGTH,
  type ArticleLength,
} from "@/lib/copy-generate-options";
import {
  scanXhsForbidden,
  segmentsForHighlight,
  riskLevelMarkClass,
  riskLevelLabel,
  type ScanResult,
} from "@/lib/xhsForbiddenScan";
import { isTitlePatternCategoryRow, resolvePromptDocRole } from "@/lib/doc-category-constants";

type Category = { id: string; name: string; icon: string; sort_order?: number };
type Doc = { id: string; title: string; category_id: string };
type PersonaOpt = { id: string; name: string; short_description: string | null };

function HighlightedForbiddenText({ text, scan }: { text: string; scan: ScanResult }) {
  const segs = segmentsForHighlight(text, scan.levelAt);
  return (
    <>
      {segs.map((s, i) => {
        const chunk = text.slice(s.start, s.end);
        if (!s.level) return <span key={i}>{chunk}</span>;
        return (
          <mark
            key={i}
            className={cn("rounded px-0.5", riskLevelMarkClass(s.level))}
            title={`风险：${riskLevelLabel(s.level)}`}
          >
            {chunk}
          </mark>
        );
      })}
    </>
  );
}

export function CopywriterClientRAG() {
  const [userInput, setUserInput] = useState("");
  const [personas, setPersonas] = useState<PersonaOpt[]>([]);
  const [personaId, setPersonaId] = useState<string>("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [allDocs, setAllDocs] = useState<Doc[]>([]);
  const [taskDocId, setTaskDocId] = useState<string>("");
  const [articleLength, setArticleLength] = useState<ArticleLength>(DEFAULT_ARTICLE_LENGTH);
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [starred, setStarred] = useState(false);
  const [sensitiveScan, setSensitiveScan] = useState<ScanResult | null>(null);

  useEffect(() => {
    void fetch("/api/personas")
      .then((r) => r.json())
      .then((j: PersonaOpt[] | { error?: string }) => {
        if (Array.isArray(j)) {
          setPersonas(j);
          if (j[0]?.id) setPersonaId(j[0].id);
        }
      })
      .catch(() => setPersonas([]));
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/docs/categories").then((r) => r.json()),
      fetch("/api/docs").then((r) => r.json()),
    ]).then(([cats, docs]) => {
      setCategories(Array.isArray(cats) ? cats : []);
      setAllDocs(Array.isArray(docs) ? docs : []);
    });
  }, []);

  const resolvedTitlePatternCategory = useMemo(
    () => categories.find((c) => isTitlePatternCategoryRow(c)),
    [categories]
  );

  const taskTemplateDocs = useMemo(() => {
    return allDocs.filter((d) => {
      const cat = categories.find((c) => c.id === d.category_id);
      if (!cat) return false;
      if (resolvedTitlePatternCategory && cat.id === resolvedTitlePatternCategory.id) return false;
      return resolvePromptDocRole(cat.name, undefined) === "format";
    });
  }, [allDocs, categories, resolvedTitlePatternCategory]);

  useEffect(() => {
    setSensitiveScan(null);
  }, [output]);

  const generate = async () => {
    if (!userInput.trim() || !personaId) {
      setError(!personaId ? "请选择人设" : "请填写创作提示");
      return;
    }
    setGenerating(true);
    setError(null);
    setOutput("");
    setStarred(false);
    setCopied(false);
    try {
      const res = await fetch("/api/ai/persona-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_id: personaId,
          user_input: userInput,
          task_template_doc_id: taskDocId || undefined,
          article_length: articleLength,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("无响应流");
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        if (buf.startsWith("ERROR: ")) {
          setError(buf.slice(7));
          setOutput("");
          return;
        }
        setOutput(buf);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (!output.trim()) return;
    await navigator.clipboard.writeText(output.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStar = async () => {
    if (!output.trim() || starred) return;
    await fetch("/api/generated-copies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_input: userInput,
        doc_ids: taskDocId ? [taskDocId] : [],
        persona_template_id: personaId,
        detected_intent: { mode: "persona-rag", persona_id: personaId },
        output: output.trim(),
        platform: "xiaohongshu",
        starred: true,
      }),
    });
    setStarred(true);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
      <div className="space-y-4">
        <div className="rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A8A29E]">
                灵魂
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-[#E7E5E4] to-transparent" aria-hidden />
            </div>
            {personas.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#E7E5E4] bg-[#FAFAF9] px-3 py-6 text-center text-xs text-[#A8A29E]">
                暂无人设，请先在内容工厂创建人设档案
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {personas.map((p) => {
                  const selected = personaId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPersonaId(p.id)}
                      className={cn(
                        "group relative min-w-0 rounded-xl border px-2 py-1.5 text-left transition-all duration-200",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1C1917]/25 focus-visible:ring-offset-1",
                        selected
                          ? "border-[#1C1917]/25 bg-gradient-to-br from-[#FAFAF9] via-white to-[#F5F5F4] shadow-sm ring-1 ring-[#1C1917]/10"
                          : "border-[#E7E5E4] bg-white hover:border-[#D6D3D1] hover:shadow-sm"
                      )}
                    >
                      {selected && (
                        <span
                          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#1C1917] ring-1 ring-white"
                          aria-hidden
                        />
                      )}
                      <div className="truncate pr-3 text-xs font-semibold leading-tight tracking-tight text-[#1C1917]">
                        {p.name}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[#78716C]">
                        {p.short_description?.trim() || "—"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            rows={5}
            placeholder="想写的话题、角度、要点…"
            className="w-full rounded-xl border border-[#E7E5E4] bg-[#FAFAF9]/40 px-3.5 py-3 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:border-[#D6D3D1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1C1917]/15"
          />

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-[#78716C]">任务约束（可选）</label>
            <select
              value={taskDocId}
              onChange={(e) => setTaskDocId(e.target.value)}
              className="h-10 w-full rounded-lg border border-[#E7E5E4] bg-white px-3 text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
            >
              <option value="">不选</option>
              {taskTemplateDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-[#78716C]">篇幅</p>
            <div className="flex gap-2">
              {ARTICLE_LENGTH_SEGMENTED.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setArticleLength(o.value)}
                  className={cn(
                    "min-h-9 flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    articleLength === o.value
                      ? "border-[#1C1917] bg-[#1C1917] text-white"
                      : "border-[#E7E5E4] bg-white text-[#1C1917] hover:bg-[#FAFAF9]"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={generating || !personaId}
            onClick={() => void generate()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1C1917] py-2.5 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                生成中…
              </>
            ) : (
              "生成正文"
            )}
          </button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>

      <div className="flex min-h-[min(70dvh,520px)] flex-col rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm lg:min-h-[calc(100dvh-10rem)]">
        {output.trim() ? (
          <div className="mb-2 flex shrink-0 justify-end">
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => void copyToClipboard()}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4]"
              >
                <Copy className="h-3.5 w-3.5" /> {copied ? "已复制" : "复制"}
              </button>
              <button
                type="button"
                onClick={() => void handleStar()}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-[#F5F5F4]",
                  starred ? "text-amber-600" : "text-[#78716C]"
                )}
              >
                <Star className={cn("h-3.5 w-3.5", starred && "fill-current")} />{" "}
                {starred ? "已收藏" : "收藏"}
              </button>
              <button
                type="button"
                disabled={!output.trim() || generating}
                onClick={() => setSensitiveScan(scanXhsForbidden(output))}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4] disabled:opacity-50"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                敏感词检查
              </button>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-4 text-sm text-[#1C1917]">
          {generating && !output && (
            <p className="text-[#A8A29E]">
              <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
              正在流式输出…
            </p>
          )}
          {output &&
            (sensitiveScan ? (
              <HighlightedForbiddenText text={output} scan={sensitiveScan} />
            ) : (
              <pre className="whitespace-pre-wrap font-sans">{output}</pre>
            ))}
        </div>
      </div>
    </div>
  );
}
