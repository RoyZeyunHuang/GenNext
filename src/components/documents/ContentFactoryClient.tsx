"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, X, Trash2, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type Category = {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  is_auto_include: boolean;
  sort_order: number;
  doc_count?: number;
};

type Doc = {
  id: string;
  category_id: string;
  title: string;
  content: string | null;
  tags: string[] | null;
  updated_at: string;
  metadata?: Record<string, unknown>;
};

const ICON_OPTIONS = ["📋", "📚", "📝", "🎭", "📁", "📄", "📌", "🔖"];

export function ContentFactoryClient() {
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
  });
  const [docForm, setDocForm] = useState({ title: "", content: "", tags: "" });

  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    const res = await fetch("/api/docs/categories?with_counts=true");
    const data = await res.json();
    setCategories(Array.isArray(data) ? data : []);
    setLoadingCategories(false);
    if (!selectedCategoryId && data?.length) setSelectedCategoryId(data[0].id);
  }, [selectedCategoryId]);

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
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const isAutoInclude = selectedCategory?.is_auto_include ?? false;

  const openAddCategory = () => {
    setCategoryForm({ name: "", icon: "📁", description: "", is_auto_include: false });
    setCategoryModal("add");
    setCategoryMenuId(null);
  };

  const openEditCategory = (c: Category) => {
    setCategoryForm({
      name: c.name,
      icon: c.icon || "📁",
      description: c.description || "",
      is_auto_include: c.is_auto_include ?? false,
    });
    setCategoryModal(c);
    setCategoryMenuId(null);
  };

  const saveCategory = async () => {
    if (!categoryForm.name.trim()) return;
    if (categoryModal === "add") {
      await fetch("/api/docs/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryForm),
      });
    } else if (categoryModal && "id" in categoryModal) {
      await fetch(`/api/docs/categories/${categoryModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryForm),
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
    setDocForm({ title: "", content: "", tags: "" });
    setDocModal("add");
  };

  const openEditDoc = (d: Doc) => {
    setDocForm({
      title: d.title,
      content: d.content || "",
      tags: (d.tags ?? []).join(", "),
    });
    setDocModal(d);
  };

  const saveDoc = async () => {
    if (!selectedCategoryId || !docForm.title.trim()) return;
    if (docModal === "add") {
      await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: selectedCategoryId,
          title: docForm.title.trim(),
          content: docForm.content.trim() || null,
          tags: docForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
    } else if (docModal && "id" in docModal) {
      await fetch(`/api/docs/${docModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: docForm.title.trim(),
          content: docForm.content.trim() || null,
          tags: docForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
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

  return (
    <div className="flex gap-6">
      {/* 左侧：类别列表 */}
      <div className="w-56 shrink-0 rounded-lg border border-[#E7E5E4] bg-white">
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {loadingCategories ? (
            <div className="py-6 text-center text-sm text-[#78716C]">加载中…</div>
          ) : (
            categories.map((c) => (
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
                <span className={cn("shrink-0 text-xs", selectedCategoryId === c.id ? "text-white/80" : "text-[#78716C]")}>
                  {c.doc_count ?? 0}
                </span>
                <div className="relative shrink-0">
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
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setCategoryMenuId(null)} />
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
                    </>
                  )}
                </div>
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
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A29E]" />
                <input
                  type="text"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="搜索文档…"
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] bg-white pl-9 pr-3 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
                />
              </div>
              <button
                type="button"
                onClick={openAddDoc}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white hover:bg-[#1C1917]/90"
              >
                <Plus className="h-4 w-4" /> 新增文档
              </button>
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
                    onClick={() => openEditDoc(d)}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="min-w-0 flex-1 text-sm font-medium text-[#1C1917] line-clamp-1">{d.title}</h3>
                      <div className="flex shrink-0 items-center gap-1">
                        {isAutoInclude && (
                          <span className="rounded bg-[#F5F5F4] px-1.5 py-0.5 text-xs text-[#78716C]">AI自动读取</span>
                        )}
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
                      </div>
                    </div>
                    <p className="mb-2 line-clamp-2 text-xs text-[#78716C]">
                      {(d.content ?? "暂无内容").slice(0, 100)}
                      {(d.content?.length ?? 0) > 100 ? "…" : ""}
                    </p>
                    {(d.tags?.length ?? 0) > 0 && (
                      <div className="mb-1 flex flex-wrap gap-1">
                        {(d.tags ?? []).map((tag) => (
                          <span key={tag} className="rounded bg-[#F5F5F4] px-1.5 py-0.5 text-xs text-[#78716C]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-[#A8A29E]">
                      {d.updated_at ? new Date(d.updated_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 类别弹窗 */}
      {categoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setCategoryModal(null)}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
        </div>
      )}

      {/* 文档弹窗 */}
      {docModal && selectedCategoryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDocModal(null)}>
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-medium text-[#1C1917]">{docModal === "add" ? "新增文档" : "编辑文档"}</h3>
              <button type="button" onClick={() => setDocModal(null)} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">标题 *</label>
                <input
                  type="text"
                  value={docForm.title}
                  onChange={(e) => setDocForm((f) => ({ ...f, title: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">内容</label>
                <textarea
                  value={docForm.content}
                  onChange={(e) => setDocForm((f) => ({ ...f, content: e.target.value }))}
                  rows={8}
                  className="w-full resize-none rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">标签（逗号分隔）</label>
                <input
                  type="text"
                  value={docForm.tags}
                  onChange={(e) => setDocForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="标签1, 标签2"
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDocModal(null)} className="h-9 rounded-lg border border-[#E7E5E4] px-4 text-sm text-[#78716C] hover:bg-[#F5F5F4]">
                取消
              </button>
              <button type="button" onClick={saveDoc} disabled={!docForm.title.trim()} className="h-9 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
