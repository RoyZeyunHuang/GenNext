"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Plus, X } from "lucide-react";
import type { Todo as TodoType } from "@/types/dashboard";
import { addTodo, toggleTodo } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TodosCard({ todos: initialTodos }: { todos: TodoType[] }) {
  const [open, setOpen] = useState(false);
  const [todos, setTodos] = useState(initialTodos);
  const router = useRouter();

  useEffect(() => {
    setTodos(initialTodos);
  }, [initialTodos]);

  async function handleToggle(id: string, current: boolean) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !current } : t))
    );
    await toggleTodo(id, !current);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTodos((prev) => prev.filter((t) => t.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="rounded-lg bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-[#1C1917]">
          <CheckSquare className="h-4 w-4 text-[#78716C]" />
          待办事项 To-do
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {todos.length === 0 ? (
        <p className="text-sm text-[#78716C]">暂无待办</p>
      ) : (
        <ul className="space-y-1">
          {todos.map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-2 rounded-md py-0.5 pr-0"
            >
              <button
                type="button"
                onClick={() => handleToggle(t.id, t.done)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#E7E5E4] bg-white text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
              >
                {t.done && (
                  <span className="text-xs font-bold text-[#1C1917]">✓</span>
                )}
              </button>
              <span
                className={cn(
                  "min-w-0 flex-1 text-sm text-[#1C1917]",
                  t.done && "text-[#78716C] line-through"
                )}
              >
                {t.content}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(t.id)}
                className="shrink-0 rounded p-1 text-[#A8A29E] opacity-0 transition-opacity hover:bg-[#F5F5F4] hover:text-red-600 group-hover:opacity-100"
                aria-label="删除"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <QuickAddTodo onClose={() => setOpen(false)} onSuccess={() => setOpen(false)} />
      )}
    </div>
  );
}

function QuickAddTodo({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const router = useRouter();

  async function submit(formData: FormData) {
    await addTodo(formData);
    router.refresh();
    onSuccess();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-semibold text-[#1C1917]">
          添加待办
        </h3>
        <form action={submit} className="space-y-3">
          <input
            name="content"
            placeholder="待办内容"
            required
            className="w-full rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-sm text-[#1C1917] placeholder:text-[#78716C] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" className="bg-[#1C1917] text-white hover:bg-[#1C1917]/90">
              添加
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
