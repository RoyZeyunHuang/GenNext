"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, MessageSquare, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const MAX_HISTORY = 10;

export function AIAssistant() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** 传给 API 的若干轮对话（不含当前这条 user；空内容的 assistant 不入历史） */
  function conversationHistoryForApi(): { role: "user" | "assistant"; content: string }[] {
    return messages
      .slice(-MAX_HISTORY)
      .filter(
        (m) =>
          m.role === "user" ||
          (m.role === "assistant" && m.content.trim().length > 0)
      )
      .map((m) => ({ role: m.role, content: m.content }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const conversationHistory = conversationHistoryForApi();

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setIsExpanded(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversation_history: conversationHistory,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          (errJson as { error?: string }).error || `HTTP ${res.status}`
        );
      }

      if (!res.body) {
        throw new Error("无响应体");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let assembled = "";

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
          let payload: { type?: string; text?: string; message?: string; success?: boolean };
          try {
            payload = JSON.parse(raw.slice(6)) as typeof payload;
          } catch {
            continue;
          }

          if (payload.type === "delta" && typeof payload.text === "string") {
            assembled += payload.text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: assembled } : m
              )
            );
          } else if (payload.type === "done") {
            if (!payload.success) {
              throw new Error("助手未正常结束回复");
            }
            break readLoop;
          } else if (payload.type === "error") {
            throw new Error(
              typeof payload.message === "string"
                ? payload.message
                : "流式输出失败"
            );
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: assembled.trim() || "（无回复）" }
            : m
        )
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `错误：${err instanceof Error ? err.message : String(err)}` }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {!isExpanded && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="fixed bottom-5 right-5 z-50 flex h-12 items-center gap-2 rounded-full bg-[#1C1917] px-4 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <MessageSquare className="h-4.5 w-4.5" />
          AI 助手
        </button>
      )}

      <div
        className={cn(
          "fixed bottom-5 right-5 z-50 flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-[#E7E5E4] bg-white shadow-lg transition-all duration-300 ease-in-out",
          isExpanded ? "h-[420px] opacity-100 translate-y-0" : "h-0 opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="flex h-12 shrink-0 items-center justify-between border-b border-[#E7E5E4] px-4 text-left text-sm font-medium text-[#1C1917]"
        >
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[#78716C]" />
            AI 助手
          </span>
          <ChevronDown className="h-4 w-4 text-[#78716C]" />
        </button>

        <div className="flex-1 space-y-3 overflow-y-auto bg-white p-3">
          {messages.length === 0 && (
            <p className="py-4 text-center text-sm text-[#78716C]">输入问题，按回车发送</p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                m.role === "user"
                  ? "ml-4 bg-[#1C1917] text-white"
                  : "mr-4 whitespace-pre-wrap bg-[#F5F5F4] text-[#1C1917]"
              )}
            >
              {m.content || (m.role === "assistant" && isLoading ? "思考中…" : "")}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="flex shrink-0 gap-2 border-t border-[#E7E5E4] bg-white p-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息..."
            className="flex-1 rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-sm text-[#1C1917] placeholder:text-[#78716C] focus:border-[#E7E5E4] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1C1917] text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </>
  );
}
