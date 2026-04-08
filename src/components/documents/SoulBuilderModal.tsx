"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainAppModalPortal } from "@/components/MainAppModalPortal";
import {
  SOUL_BOOTSTRAP_USER_MESSAGE,
  SOUL_PROMPT_MARKER,
} from "@/lib/soul-builder-constants";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

type Phase = "chatting" | "preview";

function buildApiMessages(msgs: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  const trimmed = msgs.filter((m) => m.content.trim());
  if (trimmed.length === 0) return [];
  const out: { role: "user" | "assistant"; content: string }[] = [];
  if (trimmed[0].role === "assistant") {
    out.push({ role: "user", content: SOUL_BOOTSTRAP_USER_MESSAGE });
  }
  for (const m of trimmed) {
    out.push({ role: m.role, content: m.content.trim() });
  }
  return out;
}

function stripSoulBlockFromDisplay(full: string): string {
  const idx = full.indexOf(SOUL_PROMPT_MARKER);
  if (idx === -1) return full.trim();
  const before = full.slice(0, idx).trim();
  return before.length > 0 ? before : "灵魂草稿已生成，请在下方确认后保存。";
}

type SoulBuilderModalProps = {
  open: boolean;
  onClose: () => void;
  categoryId: string | null;
  onSaved: () => void;
};

export function SoulBuilderModal({ open, onClose, categoryId, onSaved }: SoulBuilderModalProps) {
  const [phase, setPhase] = useState<Phase>("chatting");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soulDraft, setSoulDraft] = useState("");
  const [title, setTitle] = useState("新灵魂");
  const [saving, setSaving] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const reset = useCallback(() => {
    setPhase("chatting");
    setMessages([]);
    setInput("");
    setStreaming(false);
    setError(null);
    setSoulDraft("");
    setTitle("新灵魂");
    setSaving(false);
    startedRef.current = false;
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [open, messages]);

  const runStream = useCallback(
    async (apiPayload: { role: "user" | "assistant"; content: string }[]) => {
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
      setStreaming(true);
      setError(null);

      let assembled = "";
      let soulFromServer: string | undefined;

      try {
        const res = await fetch("/api/ai/soul-builder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiPayload, category_id: categoryId }),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error((errJson as { error?: string }).error || `HTTP ${res.status}`);
        }
        if (!res.body) throw new Error("无响应体");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";

        readLoop: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });

          for (;;) {
            const sep = sseBuffer.indexOf("\n\n");
            if (sep === -1) break;
            const raw = sseBuffer.slice(0, sep).trim();
            sseBuffer = sseBuffer.slice(sep + 2);
            if (!raw.startsWith("data: ")) continue;
            let payload: {
              type?: string;
              text?: string;
              message?: string;
              success?: boolean;
              soul_prompt?: string;
            };
            try {
              payload = JSON.parse(raw.slice(6)) as typeof payload;
            } catch {
              continue;
            }

            if (payload.type === "delta" && typeof payload.text === "string") {
              assembled += payload.text;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: assembled } : m))
              );
            } else if (payload.type === "done") {
              if (!payload.success) throw new Error("流未正常结束");
              if (typeof payload.soul_prompt === "string" && payload.soul_prompt.trim()) {
                soulFromServer = payload.soul_prompt.trim();
              }
              break readLoop;
            } else if (payload.type === "error") {
              throw new Error(
                typeof payload.message === "string" ? payload.message : "流式输出失败"
              );
            }
          }
        }

        if (soulFromServer) {
          setSoulDraft(soulFromServer);
          setPhase("preview");
          const display = stripSoulBlockFromDisplay(assembled);
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: display } : m))
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setStreaming(false);
      }
    },
    [categoryId]
  );

  useEffect(() => {
    if (!open || startedRef.current) return;
    startedRef.current = true;
    void runStream([]);
  }, [open, runStream]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming || phase !== "chatting") return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");

    const apiMessages = buildApiMessages(nextMessages);
    await runStream(apiMessages);
  }

  async function handleSave() {
    if (!categoryId || !soulDraft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: categoryId,
          title: title.trim() || "新灵魂",
          content: soulDraft.trim(),
          tags: ["灵魂", "AI生成"],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "保存失败");
      }
      onSaved();
      onClose();
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <MainAppModalPortal
      variant="main"
      className="items-center justify-center p-4"
      onBackdropClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (!streaming && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="soul-builder-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#E7E5E4] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#E7E5E4] px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#1C1917]" />
            <h2 id="soul-builder-title" className="text-base font-semibold text-[#1C1917]">
              AI 创建灵魂
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!streaming && !saving) {
                onClose();
                reset();
              }
            }}
            className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!categoryId && (
          <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            请先在左侧选择一个类别，再创建灵魂文档。
          </p>
        )}

        {phase === "preview" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <p className="text-sm text-[#78716C]">
              已根据对话生成灵魂设定，可编辑后保存到当前类别。
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#78716C]">标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
              />
            </div>
            <div className="min-h-0 flex-1">
              <label className="mb-1 block text-xs font-medium text-[#78716C]">灵魂 Prompt</label>
              <textarea
                value={soulDraft}
                onChange={(e) => setSoulDraft(e.target.value)}
                rows={14}
                className="w-full resize-y rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-[#E7E5E4] pt-3">
              <button
                type="button"
                onClick={() => {
                  setPhase("chatting");
                  setSoulDraft("");
                }}
                className="h-9 rounded-lg border border-[#E7E5E4] px-4 text-sm text-[#78716C] hover:bg-[#F5F5F4]"
              >
                返回对话
              </button>
              <button
                type="button"
                disabled={!categoryId || saving}
                onClick={() => void handleSave()}
                className="h-9 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> 保存中…
                  </span>
                ) : (
                  "保存为文档"
                )}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-[#1C1917] text-white"
                        : "border border-[#E7E5E4] bg-[#FAFAF9] text-[#1C1917]"
                    )}
                  >
                    {m.content || (streaming ? "…" : "")}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {error && (
              <p className="px-4 text-sm text-red-600">{error}</p>
            )}

            <form
              onSubmit={handleSend}
              className="shrink-0 border-t border-[#E7E5E4] p-3"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={categoryId ? "输入你的回答…" : "请先选择类别"}
                  disabled={!categoryId || streaming}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20 disabled:bg-[#F5F5F4]"
                />
                <button
                  type="submit"
                  disabled={!categoryId || streaming || !input.trim()}
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
                >
                  {streaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  发送
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </MainAppModalPortal>
  );
}
