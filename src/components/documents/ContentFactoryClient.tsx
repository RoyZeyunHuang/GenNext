"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Search, X, Trash2, MoreVertical, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainAppModalPortal } from "@/components/MainAppModalPortal";
import { SoulBuilderModal } from "@/components/documents/SoulBuilderModal";
import { PersonaRagTab } from "@/components/documents/PersonaRagTab";
import { canUseRagFeature } from "@/lib/persona-rag/permissions";

type Category = {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  is_auto_include: boolean;
  sort_order: number;
  doc_count?: number;
  owner_id?: string | null;
};

type Doc = {
  id: string;
  category_id: string;
  title: string;
  content: string | null;
  tags: string[] | null;
  updated_at: string;
  metadata?: Record<string, unknown>;
  owner_id?: string | null;
};

const ICON_OPTIONS = ["📋", "📚", "📝", "🎭", "🏷️", "📁", "📄", "📌", "🔖"];

function formatDocRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function ContentFactoryClient({
  layoutVariant = "default",
}: {
  layoutVariant?: "default" | "rednote";
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docSearch, setDocSearch] = useState("");
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [categoryModal, setCategoryModal] = useState<"add" | Category | null>(null);
  const [docModal, setDocModal] = useState<"add" | Doc | null>(null);
  const [categoryMenuId, setCategoryMenuId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    icon: "📁",
    description: "",
    is_auto_include: false,
    is_public: false,
  });
  const [docForm, setDocForm] = useState({ title: "", content: "", tags: "", is_public: false });
  const [savingAutoInclude, setSavingAutoInclude] = useState(false);
  const [rfMe, setRfMe] = useState<{ userId: string; isAdmin: boolean; hasMainAccess: boolean } | null>(null);
  const [docModalReadOnly, setDocModalReadOnly] = useState(false);
  const [soulBuilderOpen, setSoulBuilderOpen] = useState(false);
  const [contentFactoryTab, setContentFactoryTab] = useState<"library" | "persona-rag">("library");
  /** 仅包裹本组件 DOM，用于「⋯」菜单的点击外部关闭；避免在 document 上 capture 影响全局侧栏导航 */
  const factoryRootRef = useRef<HTMLDivElement>(null);

  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    const res = await fetch("/api/docs/categories?with_counts=true");
    const data = await res.json();
    setCategories(Array.isArray(data) ? data : []);
    setLoadingCategories(false);
  }, []);

  const fetchDocs = useCallback(async () => {
    if (!selectedCategoryId) {
      setDocs([]);
      return;
    }
    setLoadingDocs(true);
    const params = new URLSearchParams({ category_id: selectedCategoryId });
    if (docSearch) params.set("search", docSearch);
    const res = await fetch(`/api/docs?${params}`);
    const data = await res.json();
    setDocs(Array.isArray(data) ? data : []);
    setLoadingDocs(false);
  }, [selectedCategoryId, docSearch]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const isRf = layoutVariant === "rednote";
  const showRagTab = canUseRagFeature(rfMe);

  useEffect(() => {
    if (contentFactoryTab === "persona-rag") setCategoryMenuId(null);
  }, [contentFactoryTab]);

  /** 类别「⋯」菜单：仅在内容工厂根节点内 capture，点击区域外（含全局左侧导航）不监听 */
  useEffect(() => {
    if (!categoryMenuId) return;
    const root = factoryRootRef.current;
    if (!root) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target;
      const el = t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
      if (!el) return;
      if (el.closest("[data-category-menu-root]")) return;
      setCategoryMenuId(null);
    };
    root.addEventListener("pointerdown", onPointerDown, true);
    return () => root.removeEventListener("pointerdown", onPointerDown, true);
  }, [categoryMenuId]);

  useEffect(() => {
    void fetch("/api/rf/me")
      .then((r) => r.json())
      .then((j: { userId?: string | null; isAdmin?: boolean; hasMainAccess?: boolean }) => {
        setRfMe(j.userId ? { userId: j.userId, isAdmin: !!j.isAdmin, hasMainAccess: !!j.hasMainAccess } : null);
      })
      .catch(() => setRfMe(null));
  }, []);

  const { publicCategories, myCategories, orderedCategories } = useMemo(() => {
    const sorted = [...categories].sort((a, b) => {
      const ap = a.owner_id == null ? 0 : 1;
      const bp = b.owner_id == null ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    const pub = sorted.filter((c) => c.owner_id == null);
    const mine = sorted.filter((c) => c.owner_id != null);
    return {
      publicCategories: pub,
      myCategories: mine,
      orderedCategories: sorted,
    };
  }, [categories]);

  useEffect(() => {
    if (!orderedCategories.length) {
      setSelectedCategoryId(null);
      return;
    }
    setSelectedCategoryId((cur) =>
      cur && orderedCategories.some((c) => c.id === cur) ? cur : orderedCategories[0].id
    );
  }, [orderedCategories]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const isAutoInclude = selectedCategory?.is_auto_include ?? false;

  const canEditCategory = (c: Category) => {
    if (!rfMe) return !isRf;
    if (rfMe.isAdmin || rfMe.hasMainAccess) return true;
    if (c.owner_id == null) return false;
    return c.owner_id === rfMe.userId;
  };

  const canEditDoc = (d: Doc) => {
    if (!rfMe) return !isRf;
    if (rfMe.isAdmin || rfMe.hasMainAccess) return true;
    if (d.owner_id == null) return false;
    return d.owner_id === rfMe.userId;
  };

  const openAddCategory = () => {
    setCategoryForm({ name: "", icon: "📁", description: "", is_auto_include: false, is_public: false });
    setCategoryModal("add");
    setCategoryMenuId(null);
  };

  const openEditCategory = (c: Category) => {
    setCategoryForm({
      name: c.name,
      icon: c.icon || "📁",
      description: c.description || "",
      is_auto_include: c.is_auto_include ?? false,
      is_public: c.owner_id == null,
    });
    setCategoryModal(c);
    setCategoryMenuId(null);
  };

  const saveCategory = async () => {
    if (!categoryForm.name.trim()) return;
    const basePayload = {
      name: categoryForm.name.trim(),
      icon: categoryForm.icon,
      description: categoryForm.description,
      is_auto_include: categoryForm.is_auto_include,
    };
    const payload = rfMe?.isAdmin ? { ...basePayload, is_public: categoryForm.is_public } : basePayload;
    if (categoryModal === "add") {
      await fetch("/api/docs/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else if (categoryModal && "id" in categoryModal) {
      await fetch(`/api/docs/categories/${categoryModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setCategoryModal(null);
    fetchCategories();
  };

  const deleteCategory = async (c: Category) => {
    const count = c.doc_count ?? 0;
    if (count > 0 && !confirm(`该类别下有 ${count} 个文档，确认删除？`)) return;
    if (count === 0 && !confirm("确定删除该类别？")) return;
    await fetch(`/api/docs/categories/${c.id}`, { method: "DELETE" });
    setCategoryMenuId(null);
    if (selectedCategoryId === c.id) setSelectedCategoryId(categories[0]?.id ?? null);
    fetchCategories();
  };

  const openAddDoc = () => {
    setDocForm({ title: "", content: "", tags: "", is_public: false });
    setDocModalReadOnly(false);
    setDocModal("add");
  };

  const openEditDoc = (d: Doc, readOnly = false) => {
    setDocForm({
      title: d.title,
      content: d.content || "",
      tags: (d.tags ?? []).join(", "),
      is_public: d.owner_id == null,
    });
    setDocModalReadOnly(readOnly);
    setDocModal(d);
  };

  const saveDoc = async () => {
    if (!selectedCategoryId || !docForm.title.trim() || docModalReadOnly) return;
    const baseBody = {
      title: docForm.title.trim(),
      content: docForm.content.trim() || null,
      tags: docForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    const adminExtra = rfMe?.isAdmin ? { is_public: docForm.is_public } : {};
    if (docModal === "add") {
      await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: selectedCategoryId,
          ...baseBody,
          ...adminExtra,
        }),
      });
    } else if (docModal && "id" in docModal) {
      await fetch(`/api/docs/${docModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...baseBody, ...adminExtra }),
      });
    }
    setDocModal(null);
    fetchDocs();
    fetchCategories();
  };

  const deleteDoc = async (d: Doc) => {
    if (!confirm("确定删除该文档？")) return;
    await fetch(`/api/docs/${d.id}`, { method: "DELETE" });
    fetchDocs();
    fetchCategories();
  };

  const toggleCategoryAutoInclude = async (next: boolean) => {
    if (!selectedCategoryId || savingAutoInclude) return;
    if (selectedCategory && !canEditCategory(selectedCategory)) return;
    setSavingAutoInclude(true);
    const snapshot = categories;
    setCategories((cs) =>
      cs.map((c) => (c.id === selectedCategoryId ? { ...c, is_auto_include: next } : c))
    );
    try {
      const res = await fetch(`/api/docs/categories/${selectedCategoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_auto_include: next }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setCategories(snapshot);
      alert("保存失败，请重试");
    } finally {
      setSavingAutoInclude(false);
    }
  };

  const docListRfMobile = selectedCategoryId && (
    <>
      {loadingDocs ? (
        <div className="py-10 text-center text-sm text-[#78716C]">加载中…</div>
      ) : docs.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-[#78716C]">该类别下暂无文档</div>
      ) : (
        docs.map((d, i) => (
          <div key={d.id}>
            {i > 0 && <div className="mx-4 h-px bg-[#F5F5F4]" />}
            <button
              type="button"
              onClick={() => openEditDoc(d, !canEditDoc(d))}
              className="w-full px-4 py-3 text-left active:bg-[#FAFAF9]"
            >
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-[#1C1917]">
                  {d.title}
                  {isRf && d.owner_id == null && (
                    <span className="ml-1.5 rounded bg-[#F5F5F4] px-1 py-0.5 text-[9px] font-medium text-[#78716C]">
                      公共
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] text-[#A8A29E]">
                  {formatDocRelative(d.updated_at)}
                </span>
              </div>
              <p className="mb-1.5 truncate text-xs text-[#78716C]">
                {(d.content ?? "暂无内容").replace(/\s+/g, " ").slice(0, 80)}
              </p>
              {(d.tags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(d.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[#78716C] bg-[#F5F5F4]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          </div>
        ))
      )}
    </>
  );

  const docGridDesktopRf =
    selectedCategoryId &&
    (loadingDocs ? (
      <div className="py-12 text-center text-sm text-[#78716C]">加载中…</div>
    ) : docs.length === 0 ? (
      <div className="py-12 text-center text-sm text-[#78716C]">该类别下暂无文档，点击右上角新增</div>
    ) : (
      <div className="grid grid-cols-2 gap-2">
        {docs.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => openEditDoc(d, !canEditDoc(d))}
            className="group cursor-pointer rounded-lg border border-[#E7E5E4] bg-white p-2.5 text-left transition hover:border-[#D6D3D1]"
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <h3 className="line-clamp-1 min-w-0 flex-1 text-xs font-semibold text-[#1C1917]">
                {d.title}
                {isRf && d.owner_id == null && (
                  <span className="ml-1 align-middle text-[8px] font-normal text-[#A8A29E]">公共</span>
                )}
              </h3>
              {canEditDoc(d) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteDoc(d);
                  }}
                  className="shrink-0 rounded p-1 text-[#A8A29E] opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className="mb-1 line-clamp-2 text-[11px] leading-snug text-[#78716C]">
              {(d.content ?? "暂无内容").slice(0, 100)}
              {(d.content?.length ?? 0) > 100 ? "…" : ""}
            </p>
            {(d.tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1">
                {(d.tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="rounded px-1 py-0.5 text-[9px] font-medium text-[#78716C] bg-[#F5F5F4]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    ));

  return (
    <div ref={factoryRootRef} className="min-w-0">
      {isRf ? (
        <>
          {showRagTab && (
            <div className="relative z-20 flex w-full shrink-0 flex-wrap gap-1 border-b border-[#E7E5E4] bg-[#FAFAF9] px-2 py-2">
              <button
                type="button"
                onClick={() => {
                  setCategoryMenuId(null);
                  setContentFactoryTab("library");
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium",
                  contentFactoryTab === "library"
                    ? "bg-[#1C1917] text-white"
                    : "text-[#78716C] hover:bg-white"
                )}
              >
                素材库
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategoryMenuId(null);
                  setContentFactoryTab("persona-rag");
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium",
                  contentFactoryTab === "persona-rag"
                    ? "bg-[#1C1917] text-white"
                    : "text-[#78716C] hover:bg-white"
                )}
              >
                人设 RAG 库
              </button>
            </div>
          )}
          {showRagTab && contentFactoryTab === "persona-rag" ? (
            <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto bg-white p-3 lg:min-h-[calc(100dvh-48px)] lg:p-4">
              <PersonaRagTab layoutVariant="rednote" />
            </div>
          ) : (
        <div className="relative flex min-h-0 flex-1 flex-col bg-white lg:min-h-[calc(100dvh-48px)] lg:flex-row">
          {/* Mobile */}
          <div className="flex flex-1 flex-col pb-4 lg:hidden">
            <div className="mx-4 mt-2 flex items-center gap-2 rounded-[10px] bg-[#F5F5F4] px-3">
              <Search className="h-3.5 w-3.5 shrink-0 text-[#A8A29E]" />
              <input
                type="text"
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder="搜索所有文档…"
                className="h-10 flex-1 border-0 bg-transparent text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none"
              />
            </div>
            <div className="mt-1 flex items-stretch border-b border-[#E7E5E4]">
              <div className="flex flex-1 gap-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {loadingCategories ? (
                  <div className="px-4 py-3 text-xs text-[#78716C]">加载中…</div>
                ) : (
                  orderedCategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(c.id)}
                      className={cn(
                        "relative flex shrink-0 items-center gap-1 px-3 pb-2 pt-2.5 text-[13px] font-medium whitespace-nowrap",
                        selectedCategoryId === c.id
                          ? "border-b-2 border-[#1C1917] text-[#1C1917]"
                          : "border-b-2 border-transparent text-[#A8A29E]"
                      )}
                    >
                      <span>{c.icon || "📁"}</span>
                      {c.name}
                      {c.owner_id == null && (
                        <span className="rounded bg-[#F5F5F4] px-0.5 text-[8px] text-[#78716C]">共</span>
                      )}
                      <span className="text-[10px] text-[#A8A29E]">{c.doc_count ?? 0}</span>
                      {c.is_auto_include && (
                        <span className="absolute right-1 top-2 h-[5px] w-[5px] rounded-full bg-[#16a34a]" />
                      )}
                    </button>
                  ))
                )}
              </div>
              {selectedCategory && canEditCategory(selectedCategory) && (
                <button
                  type="button"
                  onClick={() => openEditCategory(selectedCategory)}
                  className="shrink-0 px-2 text-[#78716C]"
                  aria-label="编辑类别"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{docListRfMobile}</div>
            <button
              type="button"
              onClick={openAddDoc}
              className="fixed bottom-[calc(68px+24px+env(safe-area-inset-bottom,0px))] right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-[#1C1917] text-white shadow-lg lg:hidden"
              aria-label="新增文档"
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            </button>
            <div className="px-4 pt-2">
              <button
                type="button"
                onClick={openAddCategory}
                className="text-xs text-[#78716C] underline-offset-2 hover:underline"
              >
                + 新增类别
              </button>
            </div>
          </div>

          {/* Desktop rednote */}
          <div className="hidden w-[180px] shrink-0 flex-col border-r border-[#E7E5E4] bg-[#FAFAF9] lg:flex">
            <div className="max-h-[calc(100dvh-48px)] flex-1 overflow-y-auto p-2">
              <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-[#A8A29E]">
                分类
              </div>
              {loadingCategories ? (
                <div className="py-6 text-center text-xs text-[#78716C]">加载中…</div>
              ) : (
                <>
                  {publicCategories.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[#A8A29E]">
                        公共
                      </div>
                      {publicCategories.map((c) => (
                        <div
                          key={c.id}
                          className={cn(
                            "group relative flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
                            selectedCategoryId === c.id
                              ? "bg-[#1C1917] text-white"
                              : "text-[#78716C] hover:bg-[#F5F5F4]"
                          )}
                          onClick={() => setSelectedCategoryId(c.id)}
                        >
                          <span>{c.icon || "📁"}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                          <span
                            className={cn(
                              "shrink-0 text-[10px]",
                              selectedCategoryId === c.id ? "text-white/70" : "text-[#A8A29E]"
                            )}
                          >
                            {c.doc_count ?? 0}
                          </span>
                          {canEditCategory(c) && (
                            <div className="relative shrink-0" data-category-menu-root>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCategoryMenuId(categoryMenuId === c.id ? null : c.id);
                                }}
                                className="rounded p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </button>
                              {categoryMenuId === c.id && (
                                <div className="absolute right-0 top-full z-20 mt-0.5 rounded-lg border border-[#E7E5E4] bg-white py-1 shadow-lg">
                                  <button
                                    type="button"
                                    onClick={() => openEditCategory(c)}
                                    className="w-full px-3 py-1.5 text-left text-xs text-[#1C1917] hover:bg-[#F5F5F4]"
                                  >
                                    编辑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteCategory(c)}
                                    className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                                  >
                                    删除
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                  {myCategories.length > 0 && (
                    <>
                      <div className="mt-2 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[#A8A29E]">
                        我的
                      </div>
                      {myCategories.map((c) => (
                        <div
                          key={c.id}
                          className={cn(
                            "group relative flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
                            selectedCategoryId === c.id
                              ? "bg-[#1C1917] text-white"
                              : "text-[#78716C] hover:bg-[#F5F5F4]"
                          )}
                          onClick={() => setSelectedCategoryId(c.id)}
                        >
                          <span>{c.icon || "📁"}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                          <span
                            className={cn(
                              "shrink-0 text-[10px]",
                              selectedCategoryId === c.id ? "text-white/70" : "text-[#A8A29E]"
                            )}
                          >
                            {c.doc_count ?? 0}
                          </span>
                          {canEditCategory(c) && (
                            <div className="relative shrink-0" data-category-menu-root>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCategoryMenuId(categoryMenuId === c.id ? null : c.id);
                                }}
                                className="rounded p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </button>
                              {categoryMenuId === c.id && (
                                <div className="absolute right-0 top-full z-20 mt-0.5 rounded-lg border border-[#E7E5E4] bg-white py-1 shadow-lg">
                                  <button
                                    type="button"
                                    onClick={() => openEditCategory(c)}
                                    className="w-full px-3 py-1.5 text-left text-xs text-[#1C1917] hover:bg-[#F5F5F4]"
                                  >
                                    编辑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteCategory(c)}
                                    className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                                  >
                                    删除
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
            <div className="border-t border-[#E7E5E4] p-2">
              <button
                type="button"
                onClick={openAddCategory}
                className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[#E7E5E4] py-2 text-xs text-[#78716C] hover:border-[#1C1917] hover:text-[#1C1917]"
              >
                <Plus className="h-3.5 w-3.5" /> 新增类别
              </button>
            </div>
          </div>

          <div className="hidden min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E7E5E4] px-6">
              <span className="text-[15px] font-bold text-[#1C1917]">素材库</span>
              <button
                type="button"
                onClick={openAddDoc}
                className="flex h-[30px] items-center gap-1 rounded-lg border border-[#E7E5E4] bg-white px-3 text-xs font-medium text-[#1C1917] hover:bg-[#FAFAF9]"
              >
                <Plus className="h-3.5 w-3.5" /> 新增文档
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {!selectedCategoryId ? (
                <div className="py-12 text-center text-sm text-[#78716C]">请选择一个类别</div>
              ) : (
                <>
                  <div className="mb-2.5 flex flex-wrap items-center gap-3">
                    <div className="relative flex min-w-[200px] max-w-md flex-1 items-center gap-2 rounded-md bg-[#F5F5F4] px-2.5 py-0">
                      <Search className="h-3.5 w-3.5 shrink-0 text-[#A8A29E]" />
                      <input
                        type="text"
                        value={docSearch}
                        onChange={(e) => setDocSearch(e.target.value)}
                        placeholder="搜索文档…"
                        className="h-[30px] flex-1 border-0 bg-transparent text-xs text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none"
                      />
                    </div>
                    <label
                      className={cn(
                        "flex items-center gap-1.5 whitespace-nowrap text-[11px] text-[#78716C]",
                        selectedCategory && canEditCategory(selectedCategory) ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isAutoInclude}
                        disabled={
                          savingAutoInclude ||
                          !!(selectedCategory && !canEditCategory(selectedCategory))
                        }
                        onChange={(e) => void toggleCategoryAutoInclude(e.target.checked)}
                        className="rounded border-[#E7E5E4] text-[#1C1917] accent-[#1C1917] disabled:opacity-50"
                      />
                      自动载入
                    </label>
                  </div>
                  {docGridDesktopRf}
                </>
              )}
            </div>
          </div>
        </div>
          )}
        </>
      ) : (
    <>
      {showRagTab && (
        <div className="relative z-20 flex flex-wrap gap-1 rounded-lg border border-[#E7E5E4] bg-white p-1">
          <button
            type="button"
            onClick={() => {
              setCategoryMenuId(null);
              setContentFactoryTab("library");
            }}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium",
              contentFactoryTab === "library"
                ? "bg-[#1C1917] text-white"
                : "text-[#78716C] hover:bg-[#FAFAF9]"
            )}
          >
            内容素材库
          </button>
          <button
            type="button"
            onClick={() => {
              setCategoryMenuId(null);
              setContentFactoryTab("persona-rag");
            }}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium",
              contentFactoryTab === "persona-rag"
                ? "bg-[#1C1917] text-white"
                : "text-[#78716C] hover:bg-[#FAFAF9]"
            )}
          >
            人设 RAG 库
          </button>
        </div>
      )}
      {showRagTab && contentFactoryTab === "persona-rag" ? (
        <PersonaRagTab />
      ) : (
    <div className="flex gap-6">
      {/* 左侧：类别列表 */}
      <div className="w-56 shrink-0 rounded-lg border border-[#E7E5E4] bg-white">
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {loadingCategories ? (
            <div className="py-6 text-center text-sm text-[#78716C]">加载中…</div>
          ) : (
            orderedCategories.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group relative flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm",
                  selectedCategoryId === c.id ? "bg-[#1C1917] text-white" : "text-[#1C1917] hover:bg-[#F5F5F4]"
                )}
                onClick={() => setSelectedCategoryId(c.id)}
              >
                <span className="text-base">{c.icon || "📁"}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                <span className={cn(
                  "shrink-0 rounded px-1 py-0.5 text-[10px] font-medium",
                  c.owner_id == null
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-stone-100 text-stone-500"
                )}>
                  {c.owner_id == null ? "已公开" : "未公开"}
                </span>
                <span className={cn("shrink-0 text-xs", selectedCategoryId === c.id ? "text-white/80" : "text-[#78716C]")}>
                  {c.doc_count ?? 0}
                </span>
                {canEditCategory(c) && (
                <div className="relative shrink-0" data-category-menu-root>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryMenuId(categoryMenuId === c.id ? null : c.id);
                    }}
                    className="rounded p-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {categoryMenuId === c.id && (
                    <div className="absolute right-0 top-full z-20 mt-0.5 rounded-lg border border-[#E7E5E4] bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => openEditCategory(c)}
                        className="w-full px-3 py-1.5 text-left text-xs text-[#1C1917] hover:bg-[#F5F5F4]"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCategory(c)}
                        className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
                )}
              </div>
            ))
          )}
        </div>
        <div className="border-t border-[#E7E5E4] p-2">
          <button
            type="button"
            onClick={openAddCategory}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#E7E5E4] py-2 text-sm text-[#78716C] hover:border-[#1C1917] hover:text-[#1C1917]"
          >
            <Plus className="h-4 w-4" /> 新增类别
          </button>
        </div>
      </div>

      {/* 右侧：文档列表 */}
      <div className="min-w-0 flex-1">
        {!selectedCategoryId ? (
          <div className="rounded-lg border border-[#E7E5E4] bg-white p-12 text-center text-sm text-[#78716C]">
            请从左侧选择一个类别
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="relative w-full max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A29E]" />
                <input
                  type="text"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="搜索文档…"
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] bg-white pl-9 pr-3 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
                <label
                  className={cn(
                    "flex items-center gap-2 text-sm text-[#1C1917]",
                    selectedCategory && canEditCategory(selectedCategory) ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isAutoInclude}
                    disabled={
                      savingAutoInclude || !!(selectedCategory && !canEditCategory(selectedCategory))
                    }
                    onChange={(e) => void toggleCategoryAutoInclude(e.target.checked)}
                    className="rounded border-[#E7E5E4] text-[#1C1917] focus:ring-[#1C1917]/20 disabled:opacity-50"
                  />
                  <span className="whitespace-nowrap">AI 生成时自动读取此类别</span>
                </label>
                <button
                  type="button"
                  onClick={() => setSoulBuilderOpen(true)}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-white px-4 text-sm font-medium text-[#1C1917] hover:bg-[#F5F5F4]"
                >
                  <Sparkles className="h-4 w-4" /> AI 创建灵魂
                </button>
                <button
                  type="button"
                  onClick={openAddDoc}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white hover:bg-[#1C1917]/90"
                >
                  <Plus className="h-4 w-4" /> 新增文档
                </button>
              </div>
            </div>

            {loadingDocs ? (
              <div className="py-12 text-center text-sm text-[#78716C]">加载中…</div>
            ) : docs.length === 0 ? (
              <div className="rounded-lg border border-[#E7E5E4] bg-white py-12 text-center text-sm text-[#78716C]">
                该类别下暂无文档，点击右上角新增
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {docs.map((d) => (
                  <div
                    key={d.id}
                    className="group cursor-pointer rounded-lg border border-[#E7E5E4] bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                    onClick={() => openEditDoc(d, !canEditDoc(d))}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="min-w-0 flex-1 text-sm font-medium text-[#1C1917] line-clamp-1">{d.title}</h3>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          d.owner_id == null
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-stone-100 text-stone-500"
                        )}>
                          {d.owner_id == null ? "已公开" : "未公开"}
                        </span>
                        {isAutoInclude && (
                          <span className="rounded bg-[#F5F5F4] px-1.5 py-0.5 text-xs text-[#78716C]">AI自动读取</span>
                        )}
                        {canEditDoc(d) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteDoc(d);
                            }}
                            className="rounded p-1 text-[#A8A29E] opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {(d.tags?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(d.tags ?? []).map((tag) => (
                          <span key={tag} className="rounded bg-[#F5F5F4] px-1.5 py-0.5 text-xs text-[#78716C]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
      )}
    </>
      )}

      {!isRf && (
        <SoulBuilderModal
          open={soulBuilderOpen}
          onClose={() => setSoulBuilderOpen(false)}
          categoryId={selectedCategoryId}
          onSaved={() => {
            void fetchDocs();
            void fetchCategories();
          }}
        />
      )}

      {/* 类别弹窗 */}
      {categoryModal && (
        <MainAppModalPortal
          variant={isRf ? "fullscreen" : "main"}
          className={cn(
            isRf ? "items-end justify-center sm:items-center" : "items-center justify-center"
          )}
          onBackdropClick={() => setCategoryModal(null)}
        >
          <div
            className={cn(
              "w-full max-w-md bg-white p-6 shadow-xl",
              isRf ? "max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-lg" : "rounded-lg"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-medium text-[#1C1917]">{categoryModal === "add" ? "新增类别" : "编辑类别"}</h3>
              <button type="button" onClick={() => setCategoryModal(null)} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">名称 *</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">图标</label>
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.map((ico) => (
                    <button
                      key={ico}
                      type="button"
                      onClick={() => setCategoryForm((f) => ({ ...f, icon: ico }))}
                      className={cn(
                        "rounded-lg border p-2 text-lg transition-colors",
                        categoryForm.icon === ico ? "border-[#1C1917] bg-[#F5F5F4]" : "border-[#E7E5E4] hover:bg-[#FAFAF9]"
                      )}
                    >
                      {ico}
                    </button>
                  ))}
                  <input
                    type="text"
                    value={ICON_OPTIONS.includes(categoryForm.icon) ? "" : categoryForm.icon}
                    onChange={(e) => setCategoryForm((f) => ({ ...f, icon: e.target.value || "📁" }))}
                    placeholder="或输入 emoji"
                    className="w-20 rounded-lg border border-[#E7E5E4] px-2 py-1 text-center text-lg focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">描述（可选）</label>
                <input
                  type="text"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="简短说明该类别用途"
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-[#1C1917]">
                <input
                  type="checkbox"
                  checked={categoryForm.is_auto_include}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, is_auto_include: e.target.checked }))}
                  className="rounded border-[#E7E5E4] text-[#1C1917] focus:ring-[#1C1917]/20"
                />
                AI 生成时自动读取该类别下所有文档
              </label>
              {rfMe?.isAdmin && (
                <label className="flex items-center gap-2 text-sm text-[#1C1917]">
                  <input
                    type="checkbox"
                    checked={categoryForm.is_public}
                    onChange={(e) => setCategoryForm((f) => ({ ...f, is_public: e.target.checked }))}
                    className="rounded border-[#E7E5E4] text-[#1C1917] focus:ring-[#1C1917]/20"
                  />
                  设为公共（所有登录用户可见）
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCategoryModal(null)} className="h-9 rounded-lg border border-[#E7E5E4] px-4 text-sm text-[#78716C] hover:bg-[#F5F5F4]">
                取消
              </button>
              <button type="button" onClick={saveCategory} disabled={!categoryForm.name.trim()} className="h-9 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50">
                保存
              </button>
            </div>
          </div>
        </MainAppModalPortal>
      )}

      {/* 文档弹窗 */}
      {docModal && selectedCategoryId && (
        <MainAppModalPortal
          variant={isRf ? "fullscreen" : "main"}
          className={cn(
            isRf ? "items-end justify-center sm:items-center" : "items-center justify-center"
          )}
          onBackdropClick={() => {
            setDocModal(null);
            setDocModalReadOnly(false);
          }}
        >
          <div
            className={cn(
              "w-full max-w-lg bg-white p-6 shadow-xl",
              isRf ? "max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-lg" : "rounded-lg"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-medium text-[#1C1917]">
                {docModal === "add" ? "新增文档" : docModalReadOnly ? "查看文档" : "编辑文档"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setDocModal(null);
                  setDocModalReadOnly(false);
                }}
                className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">标题 *</label>
                <input
                  type="text"
                  readOnly={docModalReadOnly}
                  value={docForm.title}
                  onChange={(e) => setDocForm((f) => ({ ...f, title: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20 read-only:bg-[#FAFAF9]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">内容</label>
                <textarea
                  readOnly={docModalReadOnly}
                  value={docForm.content}
                  onChange={(e) => setDocForm((f) => ({ ...f, content: e.target.value }))}
                  rows={8}
                  className="w-full resize-none rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20 read-only:bg-[#FAFAF9]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">标签（逗号分隔）</label>
                <input
                  type="text"
                  readOnly={docModalReadOnly}
                  value={docForm.tags}
                  onChange={(e) => setDocForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="标签1, 标签2"
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20 read-only:bg-[#FAFAF9]"
                />
              </div>
              {rfMe?.isAdmin && !docModalReadOnly && (
                <label className="flex items-center gap-2 text-sm text-[#1C1917]">
                  <input
                    type="checkbox"
                    checked={docForm.is_public}
                    onChange={(e) => setDocForm((f) => ({ ...f, is_public: e.target.checked }))}
                    className="rounded border-[#E7E5E4] text-[#1C1917] focus:ring-[#1C1917]/20"
                  />
                  设为公共（所有登录用户可见）
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDocModal(null);
                  setDocModalReadOnly(false);
                }}
                className="h-9 rounded-lg border border-[#E7E5E4] px-4 text-sm text-[#78716C] hover:bg-[#F5F5F4]"
              >
                {docModalReadOnly ? "关闭" : "取消"}
              </button>
              {!docModalReadOnly && (
                <button
                  type="button"
                  onClick={saveDoc}
                  disabled={!docForm.title.trim()}
                  className="h-9 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
                >
                  保存
                </button>
              )}
            </div>
          </div>
        </MainAppModalPortal>
      )}
    </div>
  );
}
