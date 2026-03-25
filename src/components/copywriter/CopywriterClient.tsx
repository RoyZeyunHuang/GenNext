"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import { Copy, Star, Loader2, Sparkles, X, Plus, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { composeOutputWithTitle, parseTitleVariantsAndBody } from "@/lib/parse-title-variants";
import {
  riskLevelBadgeClass,
  riskLevelLabel,
  riskLevelMarkClass,
  scanXhsForbidden,
  segmentsForHighlight,
  type RiskLevel,
  type ScanResult,
} from "@/lib/xhsForbiddenScan";

const SINGLE_SELECT_CATEGORIES = ["人格模板", "任务模板"];
const TITLE_PATTERN_CATEGORY = "标题套路";
const MULTI_SELECT_CATEGORIES = ["品牌档案", "知识库"];

type Category = { id: string; name: string; icon: string; is_auto_include?: boolean };
type Doc = { id: string; title: string; category_id: string; tags?: string[] };
type SelectedItem = { doc_id: string; doc_title: string; category_name: string; reason?: string };
type Intent = { suggested_docs: SelectedItem[] };
type OpenPicker = { categoryName: string; replaceIndex?: number } | null;

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
  categoryName,
  docs,
  currentId,
  searchPlaceholder,
  onSelect,
  onClose,
}: {
  categoryName: string;
  docs: Doc[];
  currentId: string | undefined;
  searchPlaceholder: string;
  onSelect: (doc: Doc) => void;
  onClose: () => void;
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
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [starred, setStarred] = useState(false);
  const [showManualPicker, setShowManualPicker] = useState(false);
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  const [openTitlePatternPicker, setOpenTitlePatternPicker] = useState(false);
  const [titlePatternDocId, setTitlePatternDocId] = useState<string | null>(null);
  const [titlePatternUserCleared, setTitlePatternUserCleared] = useState(false);
  const [selectedTitleIdx, setSelectedTitleIdx] = useState(0);
  const [sensitiveScan, setSensitiveScan] = useState<ScanResult | null>(null);
  const [editingOutput, setEditingOutput] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const pickerAnchorRef = useRef<HTMLDivElement>(null);
  const titlePatternPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/docs/categories").then((r) => r.json()),
      fetch("/api/docs").then((r) => r.json()),
    ]).then(([cats, docs]) => {
      setCategories(Array.isArray(cats) ? cats : []);
      setAllDocs(Array.isArray(docs) ? docs : []);
    });
  }, []);

  useEffect(() => {
    if (titlePatternUserCleared) return;
    const cat = categories.find((c) => c.name === TITLE_PATTERN_CATEGORY);
    if (!cat) return;
    const inCat = allDocs.filter((d) => d.category_id === cat.id);
    if (inCat.length === 0) return;
    const preferred = inCat.find((d) => d.title === "默认标题套路") ?? inCat[0];
    setTitlePatternDocId((prev) => (prev === null ? preferred.id : prev));
  }, [allDocs, categories, titlePatternUserCleared]);

  const categoryNameById = useCallback((id: string) => categories.find((c) => c.id === id)?.name ?? "", [categories]);
  const categoryIconById = useCallback((id: string) => categories.find((c) => c.id === id)?.icon ?? "📁", [categories]);

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
      const suggested = data.suggested_docs ?? [];
      setIntent({ suggested_docs: suggested });
      setSelectedDocs(suggested);
      setSelectedDocIds(new Set(suggested.map((d: SelectedItem) => d.doc_id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "意图分析失败");
    } finally {
      setDetecting(false);
    }
  }, [userInput]);

  const toggleSelectedDoc = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const addManualDoc = (doc: Doc) => {
    const catName = categoryNameById(doc.category_id);
    if (selectedDocIds.has(doc.id)) return;
    setSelectedDocIds((prev) => new Set(prev).add(doc.id));
    setSelectedDocs((prev) => {
      if (prev.some((d) => d.doc_id === doc.id)) return prev;
      return [...prev, { doc_id: doc.id, doc_title: doc.title, category_name: catName, reason: "手动添加" }];
    });
    if (!intent) setIntent({ suggested_docs: [] });
  };

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

  const replaceMultiAt = (categoryName: string, index: number, newDoc: Doc) => {
    const catName = categoryNameById(newDoc.category_id);
    const inCat = getSelectedByCategory(categoryName);
    const oldId = inCat[index]?.doc_id;
    setSelectedDocs((prev) => {
      const rest = prev.filter((d) => d.category_name !== categoryName);
      const newInCat = [...inCat];
      newInCat[index] = { doc_id: newDoc.id, doc_title: newDoc.title, category_name: catName, reason: "手动选择" };
      return [...rest, ...newInCat];
    });
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (oldId) next.delete(oldId);
      next.add(newDoc.id);
      return next;
    });
    setOpenPicker(null);
  };

  const addMultiInCategory = (categoryName: string, newDoc: Doc) => {
    if (selectedDocIds.has(newDoc.id)) {
      setOpenPicker(null);
      return;
    }
    const catName = categoryNameById(newDoc.category_id);
    setSelectedDocs((prev) => [...prev, { doc_id: newDoc.id, doc_title: newDoc.title, category_name: catName, reason: "手动添加" }]);
    setSelectedDocIds((prev) => new Set(prev).add(newDoc.id));
    setOpenPicker(null);
  };

  const removeDoc = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      next.delete(docId);
      return next;
    });
    setSelectedDocs((prev) => prev.filter((d) => d.doc_id !== docId));
  };

  const generate = useCallback(async () => {
    setGenerating(true);
    setOutput("");
    setError(null);
    setStarred(false);
    setCopied(false);
    const docIds = Array.from(selectedDocIds);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected_doc_ids: docIds,
          user_input: userInput,
          title_pattern_doc_id: titlePatternDocId,
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
  }, [selectedDocIds, userInput, titlePatternDocId]);

  const parsedOutput = parseTitleVariantsAndBody(output);
  const showTitleVariants = !generating && parsedOutput.variants.length > 0;
  const maxTitleIdx = Math.max(0, parsedOutput.variants.length - 1);
  const safeTitleIdx = Math.min(selectedTitleIdx, maxTitleIdx);
  const selectedVariant = parsedOutput.variants[safeTitleIdx];
  const effectiveTitleForCopy = selectedVariant
    ? selectedVariant.text || `【${selectedVariant.label}】`
    : "";
  const copyPayload = showTitleVariants
    ? composeOutputWithTitle(effectiveTitleForCopy, parsedOutput.body)
    : output;

  const textToScan = (copyPayload || output).trim() ? copyPayload || output : "";

  useEffect(() => {
    setSelectedTitleIdx(0);
  }, [output]);

  useEffect(() => {
    setSensitiveScan(null);
  }, [output, selectedTitleIdx]);

  const copyToClipboard = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(copyPayload || output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStar = async () => {
    if (!output || starred) return;
    const docIds = Array.from(selectedDocIds);
    const out = copyPayload || output;
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

  const hasIntent = intent !== null && (selectedDocs.length > 0 || selectedDocIds.size > 0);
  const canShowBlock = intent !== null || selectedDocIds.size > 0 || selectedDocs.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
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

        <div className="mb-2">
          <button
            type="button"
            onClick={() => setShowManualPicker(true)}
            className="text-xs text-[#78716C] hover:text-[#1C1917]"
          >
            或 手动选择文档
          </button>
        </div>

        {canShowBlock && (
          <div className={cn("rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm", (openPicker || openTitlePatternPicker) && "relative z-[50]")}>
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
              {[...SINGLE_SELECT_CATEGORIES, ...MULTI_SELECT_CATEGORIES].map((catName) => {
                const cat = categories.find((c) => c.name === catName);
                if (!cat) return null;
                const docsInCat = allDocs.filter((d) => d.category_id === cat.id);
                if (docsInCat.length === 0) return null;
                const isSingle = SINGLE_SELECT_CATEGORIES.includes(catName);
                const selectedInCat = getSelectedByCategory(catName);

                const boxLabel = (() => {
                  if (isSingle) return selectedInCat[0]?.doc_title ?? null;
                  if (selectedInCat.length === 0) return null;
                  if (selectedInCat.length === 1) return selectedInCat[0].doc_title;
                  return `${selectedInCat[0].doc_title} 等${selectedInCat.length}个`;
                })();
                const showAdd = !isSingle;
                const openForReplace =
                  openPicker?.categoryName === catName &&
                  (isSingle ? openPicker?.replaceIndex === undefined : openPicker?.replaceIndex === 0 || (openPicker?.replaceIndex === undefined && selectedInCat.length === 0));
                const openForAdd = openPicker?.categoryName === catName && openPicker?.replaceIndex === undefined && !isSingle && selectedInCat.length > 0;

                return (
                  <div key={cat.id}>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-base">{cat.icon}</span>
                      <span className="w-20 shrink-0 text-sm text-[#78716C]">{cat.name}：</span>
                      <div className="relative min-w-0 flex-1" ref={openForReplace ? pickerAnchorRef : null}>
                        <button
                          type="button"
                          onClick={() => {
                            if (isSingle) {
                              setOpenPicker(openPicker?.categoryName === catName ? null : { categoryName: catName });
                            } else {
                              if (selectedInCat.length > 0) setOpenPicker(openPicker?.categoryName === catName && openPicker?.replaceIndex === 0 ? null : { categoryName: catName, replaceIndex: 0 });
                              else setOpenPicker(openPicker?.categoryName === catName && openPicker?.replaceIndex === undefined ? null : { categoryName: catName });
                            }
                          }}
                          className={cn(
                            "flex h-9 w-full items-center justify-between rounded-lg border border-[#E7E5E4] px-3 text-left text-sm hover:bg-[#FAFAF9]",
                            boxLabel ? "text-[#1C1917]" : "text-[#A8A29E]"
                          )}
                        >
                          <span className="truncate">{boxLabel ?? "点击选择"}</span>
                          <span className="shrink-0 text-[#A8A29E]">▾</span>
                        </button>
                        {openForReplace && (
                          <DocPickerDropdown
                            categoryName={catName}
                            docs={docsInCat}
                            currentId={isSingle ? selectedInCat[0]?.doc_id : selectedInCat[0]?.doc_id}
                            searchPlaceholder="搜索文档…"
                            onSelect={(doc) => {
                              if (isSingle) replaceSingleInCategory(catName, doc);
                              else if (selectedInCat.length === 0) addMultiInCategory(catName, doc);
                              else replaceMultiAt(catName, 0, doc);
                            }}
                            onClose={() => setOpenPicker(null)}
                          />
                        )}
                      </div>
                      {showAdd && (
                        <div className="relative shrink-0" ref={openForAdd ? pickerAnchorRef : null}>
                          <button
                            type="button"
                            onClick={() => setOpenPicker(openPicker?.categoryName === catName && openPicker?.replaceIndex === undefined ? null : { categoryName: catName })}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            + 添加
                          </button>
                          {openForAdd && (
                            <DocPickerDropdown
                              categoryName={catName}
                              docs={docsInCat}
                              currentId={undefined}
                              searchPlaceholder="搜索文档…"
                              onSelect={(doc) => addMultiInCategory(catName, doc)}
                              onClose={() => setOpenPicker(null)}
                            />
                          )}
                        </div>
                      )}
                    </div>
                    {!isSingle && selectedInCat.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1 pl-7">
                        {selectedInCat.map((item, idx) => (
                          <span key={item.doc_id} className="inline-flex items-center gap-0.5 rounded-md bg-[#F5F5F4] px-2 py-0.5 text-xs text-[#1C1917]">
                            {item.doc_title}
                            <button type="button" onClick={() => removeDoc(item.doc_id)} className="rounded p-0.5 hover:bg-[#E7E5E4] hover:text-red-600" aria-label="移除">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {(() => {
                const cat = categories.find((c) => c.name === TITLE_PATTERN_CATEGORY);
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
                        + 启用标题套路（成套标题）
                      </button>
                    </div>
                  );
                }
                if (titlePatternDocId === null) return null;
                const selectedTp = docsInCat.find((d) => d.id === titlePatternDocId);
                return (
                  <div key="title-pattern" className="relative">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-base">🏷️</span>
                      <span className="w-20 shrink-0 text-sm text-[#78716C]">标题套路：</span>
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
                            categoryName={TITLE_PATTERN_CATEGORY}
                            docs={docsInCat}
                            currentId={titlePatternDocId}
                            searchPlaceholder="搜索标题套路文档…"
                            onSelect={(doc) => {
                              setTitlePatternDocId(doc.id);
                              setOpenTitlePatternPicker(false);
                            }}
                            onClose={() => setOpenTitlePatternPicker(false)}
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTitlePatternDocId(null);
                          setTitlePatternUserCleared(true);
                          setOpenTitlePatternPicker(false);
                        }}
                        className="shrink-0 rounded p-1 text-[#78716C] hover:bg-[#F5F5F4] hover:text-red-600"
                        aria-label="移除标题套路"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {selectedDocs.length === 0 && selectedDocIds.size === 0 && (
              <p className="mt-2 text-xs text-[#A8A29E]">点击上方类别中的文档名可切换；多选类别可「添加」或点 × 移除</p>
            )}

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
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-[#1C1917]">生成结果</h3>
            {output && (
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" onClick={copyToClipboard} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]">
                  <Copy className="h-3.5 w-3.5" /> {copied ? "已复制" : "复制"}
                </button>
                <button type="button" onClick={handleStar} className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-[#F5F5F4]", starred ? "text-amber-600" : "text-[#78716C] hover:text-[#1C1917]")}>
                  <Star className={cn("h-3.5 w-3.5", starred && "fill-current")} /> {starred ? "已收藏" : "收藏"}
                </button>
                <button
                  type="button"
                  disabled={!textToScan.trim() || generating || editingOutput}
                  onClick={() => setSensitiveScan(scanXhsForbidden(textToScan))}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917] disabled:opacity-50"
                  title="基于小红书违禁词库（总表 + 房产专项）扫描，仅供参考"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  敏感词检查
                </button>
                {!showTitleVariants && (
                  <button
                    type="button"
                    disabled={!output || generating}
                    onClick={() => {
                      setEditingOutput((v) => !v);
                      setSensitiveScan(null);
                    }}
                    className="rounded px-2 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917] disabled:opacity-50"
                  >
                    {editingOutput ? "完成编辑" : "编辑文本"}
                  </button>
                )}
              </div>
            )}
          </div>
          <div
            ref={outputRef}
            className="min-h-[200px] max-h-[400px] overflow-y-auto rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-4 text-sm text-[#1C1917] whitespace-pre-wrap"
          >
            {!output && !generating && "生成结果将显示在此处"}
            {generating && !output && "..."}
            {output && !showTitleVariants && editingOutput && (
              <textarea
                value={output}
                onChange={(e) => {
                  setOutput(e.target.value);
                  setStarred(false);
                }}
                rows={14}
                className="h-full min-h-[220px] w-full resize-y rounded border border-[#E7E5E4] bg-white p-3 font-mono text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
                placeholder="在此直接修改文案；改完后可再次敏感词检查"
              />
            )}
            {output && !showTitleVariants && !editingOutput && sensitiveScan && (
              <HighlightedForbiddenText text={textToScan} scan={sensitiveScan} />
            )}
            {output && !showTitleVariants && !editingOutput && !sensitiveScan && output}
            {output && showTitleVariants && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-medium text-[#78716C]">标题变体（点击选择最终标题）</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {parsedOutput.variants.map((v, idx) => (
                      <button
                        key={`${v.label}-${idx}`}
                        type="button"
                        onClick={() => setSelectedTitleIdx(idx)}
                        className={cn(
                          "max-w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                          selectedTitleIdx === idx
                            ? "border-[#1C1917] bg-[#1C1917] text-white"
                            : "border-[#E7E5E4] bg-white text-[#1C1917] hover:border-[#A8A29E]"
                        )}
                      >
                        <span className="block text-[10px] font-medium opacity-80">【{v.label}】</span>
                        <span className="mt-0.5 block whitespace-pre-wrap">{v.text || "（无标题文案）"}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-[#78716C]">正文</p>
                  <div className="whitespace-pre-wrap text-[#1C1917]">{parsedOutput.body || "（无正文）"}</div>
                </div>
                {sensitiveScan && (
                  <div className="border-t border-[#E7E5E4] pt-4">
                    <p className="mb-2 text-xs font-medium text-[#78716C]">敏感词标注（与「复制」所用合并稿一致）</p>
                    <div className="whitespace-pre-wrap text-[#1C1917]">
                      <HighlightedForbiddenText text={textToScan} scan={sensitiveScan} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {output && sensitiveScan && !editingOutput && (
            <div className="mt-3 rounded-lg border border-[#E7E5E4] bg-white px-3 py-2.5">
              <p className="mb-2 text-xs font-medium text-[#57534E]">
                命中 {sensitiveScan.hits.length} 处
                <span className="ml-2 font-normal text-[#A8A29E]">图例：</span>
                <span className={cn("ml-1 rounded border px-1.5 py-0.5 text-[10px]", riskLevelBadgeClass("high"))}>高</span>
                <span className={cn("ml-1 rounded border px-1.5 py-0.5 text-[10px]", riskLevelBadgeClass("medium"))}>中</span>
                <span className={cn("ml-1 rounded border px-1.5 py-0.5 text-[10px]", riskLevelBadgeClass("low"))}>低</span>
              </p>
              {sensitiveScan.hits.length === 0 ? (
                <p className="text-xs text-emerald-700">未命中词库中的词条（仍须遵守平台实时规则）。</p>
              ) : (
                <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
                  {sensitiveScan.hits.map((h, i) => (
                    <li
                      key={`${h.start}-${h.end}-${h.phrase}-${i}`}
                      className="flex flex-wrap items-center gap-2 border-b border-[#F5F5F4] py-1 last:border-0"
                    >
                      <span className={cn("rounded border px-1.5 py-0.5 font-medium", riskLevelBadgeClass(h.level))}>
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
          )}
        </div>
      </div>

      {showManualPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowManualPicker(false)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#E7E5E4] p-4">
              <h3 className="text-sm font-medium text-[#1C1917]">从任意类别选择文档</h3>
              <button type="button" onClick={() => setShowManualPicker(false)} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]">
                <X className="h-5 w-5" />
      </button>
    </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {categories.map((cat) => {
                const docsInCat = allDocs.filter((d) => d.category_id === cat.id);
                if (docsInCat.length === 0) return null;
  return (
                  <div key={cat.id} className="mb-4">
                    <p className="mb-2 text-xs font-medium text-[#78716C]">{cat.icon} {cat.name}</p>
                    <div className="space-y-1">
                      {docsInCat.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => addManualDoc(doc)}
                          className={cn(
                            "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors",
                            selectedDocIds.has(doc.id) ? "bg-[#F5F5F4] font-medium text-[#1C1917]" : "text-[#1C1917] hover:bg-[#FAFAF9]"
                          )}
                        >
                          {doc.title}
                          {selectedDocIds.has(doc.id) && <span className="ml-2 text-xs text-[#78716C]">已选</span>}
            </button>
          ))}
        </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-[#E7E5E4] p-4">
              <button type="button" onClick={() => setShowManualPicker(false)} className="h-9 w-full rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white hover:bg-[#1C1917]/90">
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
