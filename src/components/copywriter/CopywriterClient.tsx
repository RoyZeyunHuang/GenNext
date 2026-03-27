"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { Copy, Star, Loader2, Sparkles, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitBodyAndStreamTitles } from "@/lib/copy-stream-titles";

function isAbortError(e: unknown): boolean {
  if (e instanceof Error && e.name === "AbortError") return true;
  if (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") {
    return true;
  }
  return false;
}
import { composeOutputWithTitle, parseTitleVariantsAndBody } from "@/lib/parse-title-variants";
import {
  ARTICLE_LENGTH_SEGMENTED,
  DEFAULT_ARTICLE_LENGTH,
  DEFAULT_PERSONA_INTENSITY,
  PERSONA_SOUL_TIERS,
  type ArticleLength,
} from "@/lib/copy-generate-options";
import {
  riskLevelBadgeClass,
  riskLevelLabel,
  riskLevelMarkClass,
  scanXhsForbidden,
  segmentsForHighlight,
  type RiskLevel,
  type ScanResult,
} from "@/lib/xhsForbiddenScan";
import { isTitlePatternCategoryRow } from "@/lib/doc-category-constants";

type Category = {
  id: string;
  name: string;
  icon: string;
  is_auto_include?: boolean;
  sort_order?: number;
};
type Doc = { id: string; title: string; category_id: string; tags?: string[] };
type SelectedItem = { doc_id: string; doc_title: string; category_name: string; reason?: string };

function dedupeOnePerCategory(docs: SelectedItem[]): SelectedItem[] {
  const byCat = new Map<string, SelectedItem>();
  for (const d of docs) {
    if (!byCat.has(d.category_name)) byCat.set(d.category_name, d);
  }
  return Array.from(byCat.values());
}
type Intent = { suggested_docs: SelectedItem[] };
type OpenPicker = { categoryName: string } | null;

function HighlightedForbiddenText({
  text,
  scan,
}: {
  text: string;
  scan: ScanResult;
}) {
  const segs = segmentsForHighlight(text, scan.levelAt);
  return (
    <>
      {segs.map((s, i) => {
        const chunk = text.slice(s.start, s.end);
        if (!s.level) {
          return <span key={i}>{chunk}</span>;
        }
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

function DocPickerDropdown({
  docs,
  currentId,
  searchPlaceholder,
  onSelect,
  onClose,
  onClear,
}: {
  docs: Doc[];
  currentId: string | undefined;
  searchPlaceholder: string;
  onSelect: (doc: Doc) => void;
  onClose: () => void;
  /** 已有选中时展示「清空」，恢复为不选 */
  onClear?: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = docs.filter(
    (d) => !search.trim() || d.title.toLowerCase().includes(search.trim().toLowerCase())
  );
  return (
    <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-56 overflow-hidden rounded-lg border border-[#E7E5E4] bg-white shadow-lg">
      <div className="border-b border-[#E7E5E4] p-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded border border-[#E7E5E4] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
        />
      </div>
      {onClear && currentId && (
        <div className="border-b border-[#E7E5E4] px-1 py-1">
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
            className="w-full rounded px-2.5 py-2 text-left text-sm text-[#78716C] hover:bg-[#FAFAF9]"
          >
            清空（不选）
          </button>
        </div>
      )}
      <div className="max-h-44 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="py-2 text-center text-xs text-[#A8A29E]">无匹配文档</p>
        ) : (
          filtered.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onSelect(doc)}
              className={cn(
                "w-full rounded px-2.5 py-2 text-left text-sm transition-colors",
                doc.id === currentId
                  ? "bg-[#1C1917]/10 font-medium text-[#1C1917]"
                  : "text-[#1C1917] hover:bg-[#FAFAF9]"
              )}
            >
              {doc.title}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function CopywriterClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allDocs, setAllDocs] = useState<Doc[]>([]);
  const [userInput, setUserInput] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<SelectedItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [generatingTitles, setGeneratingTitles] = useState(false);
  const [generatingBody, setGeneratingBody] = useState(false);
  const [titleVariants, setTitleVariants] = useState<{ label: string; text: string }[]>([]);
  const [bodyText, setBodyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [starred, setStarred] = useState(false);
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  const [openTitlePatternPicker, setOpenTitlePatternPicker] = useState(false);
  const [titlePatternDocId, setTitlePatternDocId] = useState<string | null>(null);
  const [titlePatternUserCleared, setTitlePatternUserCleared] = useState(false);
  /** 与任务模版文档独立：仅控制正文篇幅 */
  const [articleLength, setArticleLength] = useState<ArticleLength>(DEFAULT_ARTICLE_LENGTH);
  /** 人格浓度：四档代表值（见 PERSONA_SOUL_TIERS） */
  const [personaIntensity, setPersonaIntensity] = useState(DEFAULT_PERSONA_INTENSITY);
  const [selectedTitleIdx, setSelectedTitleIdx] = useState(0);
  const [sensitiveScan, setSensitiveScan] = useState<ScanResult | null>(null);
  const [editingBody, setEditingBody] = useState(false);
  const bodyOutputRef = useRef<HTMLDivElement>(null);
  const pickerAnchorRef = useRef<HTMLDivElement>(null);
  const titlePatternPickerRef = useRef<HTMLDivElement>(null);
  /** 新一次「生成正文」递增；用于忽略已过期的流式/标题回调 */
  const generateRunIdRef = useRef(0);
  const generateAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/docs/categories").then((r) => r.json()),
      fetch("/api/docs").then((r) => r.json()),
    ]).then(([cats, docs]) => {
      setCategories(Array.isArray(cats) ? cats : []);
      setAllDocs(Array.isArray(docs) ? docs : []);
    });
  }, []);

  /** 原标题模版类：名称「标题套路」/「标题」或 sort_order=6（与 generate 校验一致） */
  const resolvedTitlePatternCategory = useMemo(() => {
    return categories.find((c) => isTitlePatternCategoryRow(c));
  }, [categories]);

  /** UI 标签与 DB 类别名一致，避免写死「标题套路」 */
  const titlePatternCategoryLabel = resolvedTitlePatternCategory?.name ?? "标题";

  /** 除标题模版类外的类别，按 sort_order 排 */
  const slotCategories = useMemo(() => {
    if (!resolvedTitlePatternCategory) {
      return [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    return categories
      .filter((c) => c.id !== resolvedTitlePatternCategory.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [categories, resolvedTitlePatternCategory]);

  useEffect(() => {
    if (titlePatternUserCleared) return;
    const cat = resolvedTitlePatternCategory;
    if (!cat) return;
    const inCat = allDocs.filter((d) => d.category_id === cat.id);
    if (inCat.length === 0) return;
    const preferred = inCat.find((d) => d.title === "默认标题套路") ?? inCat[0];
    setTitlePatternDocId((prev) => (prev === null ? preferred.id : prev));
  }, [allDocs, resolvedTitlePatternCategory, titlePatternUserCleared]);

  const categoryNameById = useCallback((id: string) => categories.find((c) => c.id === id)?.name ?? "", [categories]);
  const categoryIconById = useCallback((id: string) => categories.find((c) => c.id === id)?.icon ?? "📁", [categories]);

  /** 类别改名后，用文档所属 category_id 回写 category_name，避免「快速生成」里仍是旧名导致选不中 */
  useEffect(() => {
    if (categories.length === 0 || allDocs.length === 0) return;
    setSelectedDocs((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((item) => {
        const doc = allDocs.find((d) => d.id === item.doc_id);
        if (!doc) return item;
        const name = categories.find((c) => c.id === doc.category_id)?.name;
        if (name && name !== item.category_name) {
          changed = true;
          return { ...item, category_name: name };
        }
        return item;
      });
      return changed ? next : prev;
    });
  }, [categories, allDocs, intent]);

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
      const suggested = dedupeOnePerCategory(data.suggested_docs ?? []);
      setIntent({ suggested_docs: suggested });
      setSelectedDocs(suggested);
      setSelectedDocIds(new Set(suggested.map((d: SelectedItem) => d.doc_id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "意图分析失败");
    } finally {
      setDetecting(false);
    }
  }, [userInput]);

  const getSelectedByCategory = useCallback(
    (categoryName: string) => selectedDocs.filter((d) => d.category_name === categoryName),
    [selectedDocs]
  );

  const replaceSingleInCategory = (categoryName: string, newDoc: Doc) => {
    const catName = categoryNameById(newDoc.category_id);
    setSelectedDocs((prev) => {
      const rest = prev.filter((d) => d.category_name !== categoryName);
      return [...rest, { doc_id: newDoc.id, doc_title: newDoc.title, category_name: catName, reason: "手动选择" }];
    });
    setSelectedDocIds((prev) => {
      const old = selectedDocs.find((d) => d.category_name === categoryName)?.doc_id;
      const next = new Set(prev);
      if (old) next.delete(old);
      next.add(newDoc.id);
      return next;
    });
    setOpenPicker(null);
  };

  const clearCategorySelection = useCallback((categoryName: string) => {
    const docId = selectedDocs.find((d) => d.category_name === categoryName)?.doc_id;
    if (docId) {
      setSelectedDocIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
    setSelectedDocs((prev) => prev.filter((d) => d.category_name !== categoryName));
    setOpenPicker(null);
  }, [selectedDocs]);

  const buildGeneratePayload = useCallback(() => {
    const docIds = dedupeOnePerCategory(selectedDocs).map((d) => d.doc_id);
    return {
      selected_doc_ids: docIds,
      user_input: userInput,
      title_pattern_doc_id: titlePatternDocId,
      article_length: articleLength,
      persona_intensity: personaIntensity,
    };
  }, [selectedDocs, userInput, titlePatternDocId, articleLength, personaIntensity]);

  /** 根据已写正文 + 标题套路生成标题（工具 JSON）；可选 signal/runId 与正文生成串行 */
  const generateTitlesFromBody = useCallback(
    async (
      bodyForTitles: string,
      opts?: { signal?: AbortSignal; runId?: number }
    ) => {
      const text = bodyForTitles.trim();
      if (!text) {
        setError("正文为空，无法生成标题");
        return;
      }
      const { signal, runId } = opts ?? {};
      if (runId !== undefined && runId !== generateRunIdRef.current) return;

      setGeneratingTitles(true);
      setError(null);
      setStarred(false);
      setCopied(false);
      setSensitiveScan(null);
      setEditingBody(false);
      try {
        const res = await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...buildGeneratePayload(),
            phase: "titles",
            body_text: text,
          }),
          signal,
        });
        if (runId !== undefined && runId !== generateRunIdRef.current) return;

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const contentType = res.headers.get("Content-Type") || "";

        if (contentType.includes("application/json")) {
          const data = await res.json();
          if (runId !== undefined && runId !== generateRunIdRef.current) return;
          if (data.structured && Array.isArray(data.titles)) {
            setTitleVariants(
              data.titles.map((t: { type_name: string; text: string }) => ({
                label: t.type_name,
                text: t.text,
              }))
            );
            setSelectedTitleIdx(0);
          } else {
            setTitleVariants([]);
            throw new Error("标题格式异常");
          }
        } else {
          const reader = res.body?.getReader();
          if (!reader) throw new Error("无响应流");
          const decoder = new TextDecoder();
          let result = "";
          while (true) {
            if (runId !== undefined && runId !== generateRunIdRef.current) return;
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            result += chunk;
            if (result.startsWith("ERROR: ")) {
              setError(result.slice(7));
              setTitleVariants([]);
              return;
            }
          }
          if (runId !== undefined && runId !== generateRunIdRef.current) return;
          const parsed = parseTitleVariantsAndBody(result);
          if (parsed.variants.length === 0) {
            setError("未能从文本中解析出标题（需每行「【类型】标题」格式）。请重试。");
            setTitleVariants([]);
            return;
          }
          setTitleVariants(parsed.variants);
          setSelectedTitleIdx(0);
        }
      } catch (e) {
        if (isAbortError(e)) return;
        if (runId !== undefined && runId !== generateRunIdRef.current) return;
        setError(e instanceof Error ? e.message : "生成标题失败");
      } finally {
        setGeneratingTitles(false);
      }
    },
    [buildGeneratePayload]
  );

  /** 先流式生成正文，完成后自动根据正文生成标题（Abort + runId 串行，防并发覆盖） */
  const generateBodyFirst = useCallback(async () => {
    const runId = ++generateRunIdRef.current;
    generateAbortRef.current?.abort();
    const ac = new AbortController();
    generateAbortRef.current = ac;

    setGeneratingBody(true);
    setError(null);
    setStarred(false);
    setCopied(false);
    setTitleVariants([]);
    setBodyText("");
    setSensitiveScan(null);
    setEditingBody(false);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildGeneratePayload(), phase: "body" }),
        signal: ac.signal,
      });
      if (runId !== generateRunIdRef.current) return;

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无响应流");
      const decoder = new TextDecoder();
      let result = "";
      while (true) {
        if (runId !== generateRunIdRef.current) return;
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        result += chunk;
        if (result.startsWith("ERROR: ")) {
          if (runId !== generateRunIdRef.current) return;
          setError(result.slice(7));
          setBodyText("");
          return;
        }
        const { body: bodyForDisplay } = splitBodyAndStreamTitles(result);
        flushSync(() => setBodyText(bodyForDisplay));
        if (bodyOutputRef.current) {
          bodyOutputRef.current.scrollTop = bodyOutputRef.current.scrollHeight;
        }
      }
      if (runId !== generateRunIdRef.current) return;

      const { body: finalBody, titles: streamedTitles } = splitBodyAndStreamTitles(result);
      setBodyText(finalBody);
      if (streamedTitles && streamedTitles.length > 0) {
        setTitleVariants(
          streamedTitles.map((t) => ({
            label: t.type_name,
            text: t.text,
          }))
        );
        setSelectedTitleIdx(0);
      } else if (finalBody.trim()) {
        await generateTitlesFromBody(finalBody, { signal: ac.signal, runId });
      }
    } catch (e) {
      if (isAbortError(e)) return;
      if (runId !== generateRunIdRef.current) return;
      setError(e instanceof Error ? e.message : "生成正文失败");
    } finally {
      if (runId === generateRunIdRef.current) {
        setGeneratingBody(false);
      }
    }
  }, [buildGeneratePayload, generateTitlesFromBody]);

  const updateVariantText = (idx: number, text: string) => {
    setTitleVariants((prev) => {
      const next = [...prev];
      if (next[idx]) next[idx] = { ...next[idx], text };
      return next;
    });
    setStarred(false);
  };

  const parsedOutput = { variants: titleVariants, body: bodyText };
  const showTitleVariants = titleVariants.length > 0;
  const maxTitleIdx = Math.max(0, parsedOutput.variants.length - 1);
  const safeTitleIdx = Math.min(selectedTitleIdx, maxTitleIdx);
  const selectedVariant = parsedOutput.variants[safeTitleIdx];
  const effectiveTitleForCopy = selectedVariant
    ? selectedVariant.text || `【${selectedVariant.label}】`
    : "";
  const copyPayload =
    showTitleVariants && bodyText.trim()
      ? composeOutputWithTitle(effectiveTitleForCopy, bodyText)
      : showTitleVariants
        ? (effectiveTitleForCopy.trim()
            ? effectiveTitleForCopy
            : titleVariants.map((v) => `【${v.label}】${v.text}`).join("\n"))
        : bodyText.trim();

  const textToScan = copyPayload.trim();
  const hasResultContent = titleVariants.length > 0 || bodyText.trim().length > 0;

  useEffect(() => {
    setSensitiveScan(null);
  }, [bodyText, selectedTitleIdx]);

  const generating = generatingTitles || generatingBody;

  const copyToClipboard = async () => {
    if (!copyPayload.trim()) return;
    await navigator.clipboard.writeText(copyPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStar = async () => {
    if (!copyPayload.trim() || starred) return;
    const docIds = dedupeOnePerCategory(selectedDocs).map((d) => d.doc_id);
    const out = copyPayload;
    await fetch("/api/generated-copies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_input: userInput,
        doc_ids: docIds,
        detected_intent: intent,
        output: out,
        platform: null,
        starred: true,
      }),
    });
    setStarred(true);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-stretch">
      <div className="space-y-4">
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
                解析任务中…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                任务解析
              </>
            )}
          </button>
        </div>

        <div
          className={cn(
            "rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm",
            (openPicker || openTitlePatternPicker) && "relative z-[50]"
          )}
        >
            {(openPicker || openTitlePatternPicker) && (
              <div
                className="fixed inset-0 z-[40]"
                onClick={() => {
                  setOpenPicker(null);
                  setOpenTitlePatternPicker(false);
                }}
                aria-hidden
              />
            )}
            <h3 className="mb-3 text-sm font-medium text-[#1C1917]">AI 将使用</h3>

            <div className="space-y-3">
              {slotCategories.map((cat) => {
                const catName = cat.name;
                const docsInCat = allDocs.filter((d) => d.category_id === cat.id);
                if (docsInCat.length === 0) return null;
                const selectedInCat = getSelectedByCategory(catName);
                const boxLabel = selectedInCat[0]?.doc_title ?? null;
                const openForRow = openPicker?.categoryName === catName;

                return (
                  <div key={cat.id}>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-base">{cat.icon}</span>
                      <span className="w-20 shrink-0 text-sm text-[#78716C]">{cat.name}：</span>
                      <div className="relative min-w-0 flex-1" ref={openForRow ? pickerAnchorRef : null}>
                        <button
                          type="button"
                          onClick={() => setOpenPicker(openPicker?.categoryName === catName ? null : { categoryName: catName })}
                          className={cn(
                            "flex h-9 w-full items-center justify-between rounded-lg border border-[#E7E5E4] px-3 text-left text-sm hover:bg-[#FAFAF9]",
                            boxLabel ? "text-[#1C1917]" : "text-[#A8A29E]"
                          )}
                        >
                          <span className="truncate">{boxLabel ?? "点击选择"}</span>
                          <span className="shrink-0 text-[#A8A29E]">▾</span>
                        </button>
                        {openForRow && (
                          <DocPickerDropdown
                            docs={docsInCat}
                            currentId={selectedInCat[0]?.doc_id}
                            searchPlaceholder="搜索文档…"
                            onSelect={(doc) => replaceSingleInCategory(catName, doc)}
                            onClose={() => setOpenPicker(null)}
                            onClear={() => clearCategorySelection(catName)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {(() => {
                const cat = resolvedTitlePatternCategory;
                if (!cat) return null;
                const docsInCat = allDocs.filter((d) => d.category_id === cat.id);
                if (docsInCat.length === 0) return null;
                if (titlePatternDocId === null && titlePatternUserCleared) {
                  return (
                    <div key="title-pattern-enable">
                      <button
                        type="button"
                        onClick={() => {
                          setTitlePatternUserCleared(false);
                          const preferred = docsInCat.find((d) => d.title === "默认标题套路") ?? docsInCat[0];
                          setTitlePatternDocId(preferred.id);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        + 启用「{cat.name}」（成套标题）
                      </button>
                    </div>
                  );
                }
                if (titlePatternDocId === null) return null;
                const selectedTp = docsInCat.find((d) => d.id === titlePatternDocId);
                return (
                  <div key="title-pattern" className="relative">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-base">{cat.icon || "🏷️"}</span>
                      <span className="shrink-0 whitespace-nowrap text-sm text-[#78716C]">{cat.name}：</span>
                      <div className="relative min-w-0 flex-1" ref={titlePatternPickerRef}>
                        <button
                          type="button"
                          onClick={() => setOpenTitlePatternPicker((o) => !o)}
                          className={cn(
                            "flex h-9 w-full items-center justify-between rounded-lg border border-[#E7E5E4] px-3 text-left text-sm hover:bg-[#FAFAF9]",
                            selectedTp ? "text-[#1C1917]" : "text-[#A8A29E]"
                          )}
                        >
                          <span className="truncate">{selectedTp?.title ?? "点击选择"}</span>
                          <span className="shrink-0 text-[#A8A29E]">▾</span>
                        </button>
                        {openTitlePatternPicker && (
                          <DocPickerDropdown
                            docs={docsInCat}
                            currentId={titlePatternDocId ?? undefined}
                            searchPlaceholder={`搜索${cat.name}文档…`}
                            onSelect={(doc) => {
                              setTitlePatternDocId(doc.id);
                              setOpenTitlePatternPicker(false);
                            }}
                            onClose={() => setOpenTitlePatternPicker(false)}
                            onClear={() => {
                              setTitlePatternDocId(null);
                              setTitlePatternUserCleared(true);
                              setOpenTitlePatternPicker(false);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {selectedDocs.length === 0 && selectedDocIds.size === 0 && (
              <p className="mt-2 text-xs text-[#A8A29E]">点击各类别下拉框选择文档</p>
            )}

            <div className="mt-4 space-y-2 border-t border-[#E7E5E4] pt-4">
              <p className="text-sm text-[#78716C]">正文长度</p>
              <div className="flex gap-2">
                {ARTICLE_LENGTH_SEGMENTED.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setArticleLength(o.value)}
                    title="与任务类参考文档无关，仅控制生成正文的篇幅档位"
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

            <div className="mt-4 space-y-2 border-t border-[#E7E5E4] pt-4">
              <p className="text-sm text-[#78716C]">人格浓度</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PERSONA_SOUL_TIERS.map((tier) => (
                  <button
                    key={tier.intensity}
                    type="button"
                    onClick={() => setPersonaIntensity(tier.intensity)}
                    title={tier.title}
                    className={cn(
                      "min-h-9 rounded-lg border px-2 py-2 text-sm font-medium transition-colors",
                      personaIntensity === tier.intensity
                        ? "border-[#1C1917] bg-[#1C1917] text-white"
                        : "border-[#E7E5E4] bg-white text-[#1C1917] hover:bg-[#FAFAF9]"
                    )}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={generateBodyFirst}
              disabled={generating}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1C1917] py-2.5 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
            >
              {generatingBody ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  生成正文中…
                </>
              ) : generatingTitles ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  生成标题中…
                </>
              ) : (
                "生成正文"
              )}
            </button>
          </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}
      </div>

      <div className="flex min-h-0 flex-col lg:min-h-[calc(100dvh-9rem)]">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <h3 className="text-sm font-medium text-[#1C1917]">生成结果</h3>
            {hasResultContent && (
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" onClick={copyToClipboard} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]">
                  <Copy className="h-3.5 w-3.5" /> {copied ? "已复制" : "复制"}
                </button>
                <button type="button" onClick={handleStar} className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-[#F5F5F4]", starred ? "text-amber-600" : "text-[#78716C] hover:text-[#1C1917]")}>
                  <Star className={cn("h-3.5 w-3.5", starred && "fill-current")} /> {starred ? "已收藏" : "收藏"}
                </button>
                <button
                  type="button"
                  disabled={!textToScan.trim() || generating || editingBody}
                  onClick={() => setSensitiveScan(scanXhsForbidden(textToScan))}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917] disabled:opacity-50"
                  title="基于小红书违禁词库（总表 + 房产专项）扫描，仅供参考"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  敏感词检查
                </button>
              </div>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-4 text-sm text-[#1C1917]">
            {!bodyText && !generatingBody && !generatingTitles && (
              <p className="text-[#A8A29E]">先点击左侧「生成正文」：正文会流式出现，同一轮生成结束后会带上标题变体（无需第二次请求）。</p>
            )}

            {(generatingBody || bodyText) && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-[#78716C]">正文</p>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={generateBodyFirst}
                      disabled={generating}
                      className="rounded bg-[#1C1917] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
                    >
                      {generatingBody ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          生成中…
                        </span>
                      ) : (
                        "重新生成正文"
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={!bodyText || generatingBody}
                      onClick={() => {
                        setEditingBody((v) => !v);
                        setSensitiveScan(null);
                      }}
                      className="rounded border border-[#E7E5E4] bg-white px-2.5 py-1 text-xs text-[#57534E] hover:bg-[#FAFAF9] disabled:opacity-50"
                    >
                      {editingBody ? "完成编辑" : "编辑正文"}
                    </button>
                  </div>
                </div>
                <div
                  ref={bodyOutputRef}
                  className="min-h-[min(12rem,30dvh)] flex-1 overflow-y-auto rounded-lg border border-[#E7E5E4] bg-white p-3 text-[#1C1917] lg:min-h-[16rem]"
                >
                  {generatingBody && !bodyText && (
                    <span className="text-[#A8A29E]">
                      <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                      正在流式输出…
                    </span>
                  )}
                  {editingBody && (
                    <textarea
                      value={bodyText}
                      onChange={(e) => {
                        setBodyText(e.target.value);
                        setStarred(false);
                      }}
                      rows={12}
                      className="min-h-[200px] w-full resize-y rounded border border-[#E7E5E4] bg-[#FAFAF9] p-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
                      placeholder="正文内容"
                    />
                  )}
                  {!editingBody && sensitiveScan && textToScan.trim() && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-[#78716C]">
                        敏感词标注（与「复制」所用合并稿一致）
                      </p>
                      <div className="whitespace-pre-wrap break-words">
                        <HighlightedForbiddenText text={textToScan} scan={sensitiveScan} />
                      </div>
                      <div className="border-t border-[#F5F5F4] pt-3">
                        <p className="mb-2 text-xs font-medium text-[#57534E]">
                          命中 {sensitiveScan.hits.length} 处
                          <span className="ml-2 font-normal text-[#A8A29E]">图例：</span>
                          <span className={cn("ml-1 rounded border px-1.5 py-0.5 text-[10px]", riskLevelBadgeClass("high"))}>
                            高
                          </span>
                          <span className={cn("ml-1 rounded border px-1.5 py-0.5 text-[10px]", riskLevelBadgeClass("medium"))}>
                            中
                          </span>
                          <span className={cn("ml-1 rounded border px-1.5 py-0.5 text-[10px]", riskLevelBadgeClass("low"))}>
                            低
                          </span>
                        </p>
                        {sensitiveScan.hits.length === 0 ? (
                          <p className="text-xs text-emerald-700">未命中词库中的词条（仍须遵守平台实时规则）。</p>
                        ) : (
                          <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
                            {sensitiveScan.hits.map((h, i) => (
                              <li
                                key={`${h.start}-${h.end}-${h.phrase}-${i}`}
                                className="flex flex-wrap items-center gap-2 border-b border-[#F5F5F4] py-1 last:border-0"
                              >
                                <span
                                  className={cn(
                                    "rounded border px-1.5 py-0.5 font-medium",
                                    riskLevelBadgeClass(h.level)
                                  )}
                                >
                                  {riskLevelLabel(h.level as RiskLevel)}
                                </span>
                                <span className="font-medium text-[#1C1917]">{h.phrase}</span>
                                <span className="text-[#A8A29E]">
                                  位置 {h.start}–{h.end}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                  {!editingBody && !sensitiveScan && bodyText && (
                    <span className="block whitespace-pre-wrap">{bodyText}</span>
                  )}
                  {!editingBody && !sensitiveScan && !bodyText && !generatingBody && (
                    <span className="text-[#A8A29E]">（尚未生成正文）</span>
                  )}
                </div>
              </div>
            )}

            {(generatingTitles || showTitleVariants) && (bodyText || generatingBody) && (
              <div className="mt-4 flex flex-col gap-4 border-t border-[#E7E5E4] pt-4">
                {generatingTitles && !showTitleVariants && (
                  <p className="flex items-center gap-2 text-[#78716C]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在根据正文生成标题…
                  </p>
                )}
                {generatingTitles && showTitleVariants && (
                  <p className="flex shrink-0 items-center gap-2 text-xs text-[#78716C]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    正在重新生成标题…
                  </p>
                )}
                {showTitleVariants && (
                  <div className="shrink-0">
                    <div className="mb-2">
                      <p className="text-xs font-medium text-[#78716C]">
                        标题变体（根据正文与「{titlePatternCategoryLabel}」文档；点击选择，可编辑）
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {parsedOutput.variants.map((v, idx) => (
                        <div
                          key={`${v.label}-${idx}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedTitleIdx(idx)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedTitleIdx(idx);
                            }
                          }}
                          className={cn(
                            "max-w-full min-w-[200px] flex-1 cursor-pointer rounded-lg border p-2 transition-colors sm:max-w-[calc(50%-4px)]",
                            selectedTitleIdx === idx
                              ? "border-[#1C1917] bg-[#1C1917] text-white ring-1 ring-[#1C1917]"
                              : "border-[#E7E5E4] bg-white text-[#1C1917]"
                          )}
                        >
                          <span
                            className={cn(
                              "block text-[10px] font-medium",
                              selectedTitleIdx === idx ? "text-white/90" : "text-[#78716C]"
                            )}
                          >
                            【{v.label}】
                          </span>
                          <textarea
                            value={v.text}
                            readOnly={generatingTitles}
                            onChange={(e) => updateVariantText(idx, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            rows={3}
                            className={cn(
                              "mt-1 w-full resize-y rounded border bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-2",
                              selectedTitleIdx === idx
                                ? "border-white/30 text-white placeholder:text-white/50 focus:ring-white/30"
                                : "border-[#E7E5E4] text-[#1C1917] focus:ring-[#1C1917]/20"
                            )}
                            placeholder="标题文案"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
