"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, CircleAlert, Loader2, Send, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAiErrorForUser } from "@/lib/ai-user-facing-error";

/**
 * RF Chat v2 前端
 *
 * 与 v1 的差异：
 *  - 工具事件里带 status（ok/ambiguous/not_found/...），不同 status 渲染不同颜色
 *  - 支持 type:"ask_user" 事件：渲染成可点击按钮，点击后作为新 user message 发送
 *  - 每个工具调用在徽章里显示 status + 可选的 user_facing_message
 */

type ToolCallLog = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "running" | string; // "ok" | "ambiguous" | "not_found" | ...
  user_facing_message?: string;
  candidates?: Array<{ id: string; label: string; hint?: string }>;
};

type AskUser = {
  question: string;
  options: Array<{ id: string; label: string; hint?: string }>;
  answered: boolean;
};

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools: ToolCallLog[];
  askUser?: AskUser;
  error?: string;
};

const MAX_HISTORY = 12;

const EXAMPLE_PROMPTS = [
  "LIC 有哪些 $3500 以下的 studio？",
  "Halletts 那几栋楼最新价格",
  "带泳池 + 2024 年建的楼有哪些",
  "帮我用 Mia 人格给 The Orchard 写一篇",
];

export interface ChatClientProps {
  /** 页面头部标题，默认「小黑」 */
  title?: string;
  /** 副标 */
  subtitle?: string;
  /** 示例 prompt（为空则用默认） */
  examples?: string[];
}

export function ChatClient({
  title = "小黑",
  subtitle = "24 小时赛博牛马 · 查楼盘 · 出文案",
  examples = EXAMPLE_PROMPTS,
}: ChatClientProps = {}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  /**
   * 用户有没有在滚动容器底部附近。只有在底部附近时才 auto-scroll，
   * 这样用户往上翻看历史时不会被流式 delta 硬拽回底部。
   */
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsAtBottom(nearBottom);
  }

  // 只在"用户本来就在底部"时才 auto-scroll；用 "auto" 不是 "smooth"，
  // 否则流式 delta 每次都会触发一次 smooth 动画，卡卡的。
  useEffect(() => {
    if (!isAtBottom) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, isAtBottom]);

  function conversationHistoryForApi() {
    return messages
      .slice(-MAX_HISTORY)
      .filter(
        (m) => m.role === "user" || (m.role === "assistant" && m.content.trim())
      )
      .map((m) => ({ role: m.role, content: m.content }));
  }

  async function handleSubmit(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const history = conversationHistoryForApi();
    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      tools: [],
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Msg = {
      id: assistantId,
      role: "assistant",
      content: "",
      tools: [],
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/rf/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          conversation_history: history,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error((errJson as { error?: string }).error || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("无响应体");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assembled = "";

      readLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        for (;;) {
          const sep = buf.indexOf("\n\n");
          if (sep === -1) break;
          const raw = buf.slice(0, sep).trim();
          buf = buf.slice(sep + 2);
          if (!raw.startsWith("data: ")) continue;
          let payload: {
            type?: string;
            text?: string;
            name?: string;
            input?: Record<string, unknown>;
            id?: string;
            status?: string;
            candidates?: Array<{ id: string; label: string; hint?: string }>;
            user_facing_message?: string;
            question?: string;
            options?: Array<{ id: string; label: string; hint?: string }>;
            message?: string;
            success?: boolean;
          };
          try {
            payload = JSON.parse(raw.slice(6));
          } catch {
            continue;
          }

          if (payload.type === "delta" && typeof payload.text === "string") {
            assembled += payload.text;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: assembled } : m))
            );
          } else if (payload.type === "tool_call" && payload.name && payload.id) {
            const entry: ToolCallLog = {
              id: payload.id,
              name: payload.name,
              input: payload.input ?? {},
              status: "running",
            };
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, tools: [...m.tools, entry] } : m
              )
            );
          } else if (payload.type === "tool_result" && payload.id) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      tools: m.tools.map((t) =>
                        t.id === payload.id
                          ? {
                              ...t,
                              status: payload.status ?? "ok",
                              user_facing_message: payload.user_facing_message,
                              candidates: payload.candidates,
                            }
                          : t
                      ),
                    }
                  : m
              )
            );
          } else if (payload.type === "ask_user" && payload.question) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      askUser: {
                        question: payload.question ?? "",
                        options: payload.options ?? [],
                        answered: false,
                      },
                    }
                  : m
              )
            );
          } else if (payload.type === "done") {
            if (!payload.success) throw new Error("助手未正常结束回复");
            break readLoop;
          } else if (payload.type === "error") {
            throw new Error(payload.message || "流式输出失败");
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantId) return m;
          const content = assembled.trim();
          return { ...m, content: content || m.askUser ? content : "（没有更多内容）" };
        })
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, error: formatAiErrorForUser(err) } : m
        )
      );
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function pickOption(msgId: string, optionLabel: string) {
    // 标记已回答
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.askUser ? { ...m, askUser: { ...m.askUser, answered: true } } : m
      )
    );
    // 作为新 user 消息发送
    void handleSubmit(optionLabel);
  }

  return (
    // Grid 三行布局——聊天 UI 的教科书做法，比 flex+flex-1 可靠得多：
    //  · row 1 (auto): header
    //  · row 2 (1fr):  messages，独立滚
    //  · row 3 (auto): 输入
    // h-full 取父容器高度（main 由 LayoutWithSidebar 给到 h-screen）
    <div
      className="grid h-full min-h-0 bg-[#FAFAF9]"
      style={{ gridTemplateRows: "auto minmax(0,1fr) auto" }}
    >
      <header className="hidden items-center gap-2 border-b border-[#E7E5E4] bg-white px-6 py-3 lg:flex">
        <Sparkles className="h-4 w-4 text-[#78716C]" />
        <h1 className="text-sm font-semibold text-[#1C1917]">{title}</h1>
        <span className="text-xs text-[#A8A29E]">{subtitle}</span>
      </header>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 lg:px-6">
          {messages.length === 0 && (
            <div className="my-6 rounded-xl border border-dashed border-[#E7E5E4] bg-white p-5 text-sm text-[#57534E]">
              <div className="mb-2 font-medium text-[#1C1917]">你可以问我：</div>
              <div className="flex flex-wrap gap-2">
                {examples.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleSubmit(p)}
                    disabled={loading}
                    className="rounded-full border border-[#E7E5E4] bg-[#FAFAF9] px-3 py-1 text-xs text-[#44403C] hover:bg-[#F5F5F4] disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="mt-3 text-xs text-[#A8A29E]">
                注：调用「帮我出文案」会消耗一次黑魔法周额度（每周 15 次）。
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} onPick={(label) => pickOption(m.id, label)} />
          ))}

          {loading &&
            messages[messages.length - 1]?.role === "assistant" &&
            !messages[messages.length - 1]?.content &&
            !messages[messages.length - 1]?.askUser && (
              <div className="flex items-center gap-2 text-xs text-[#A8A29E]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> 思考中…
              </div>
            )}
          <div />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="border-t border-[#E7E5E4] bg-white px-4 py-3 lg:px-6"
      >
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="问我楼盘、找房源、出文案…（Enter 发送，Shift+Enter 换行）"
            rows={2}
            disabled={loading}
            className="flex-1 resize-none rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:border-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/10 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1C1917] text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
            aria-label="发送"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ msg, onPick }: { msg: Msg; onPick: (label: string) => void }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#1C1917] px-4 py-2.5 text-sm text-white">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {msg.tools.length > 0 && <ToolCallList tools={msg.tools} />}

      {msg.error ? (
        <div className="max-w-[90%] rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {msg.error}
        </div>
      ) : msg.content ? (
        <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-sm text-[#1C1917] shadow-sm ring-1 ring-[#E7E5E4]">
          {msg.content}
        </div>
      ) : null}

      {msg.askUser && (
        <AskUserBlock
          q={msg.askUser}
          onPick={(label) => !msg.askUser?.answered && onPick(label)}
        />
      )}
    </div>
  );
}

function AskUserBlock({
  q,
  onPick,
}: {
  q: AskUser;
  onPick: (label: string) => void;
}) {
  return (
    <div className="max-w-[90%] rounded-xl border border-[#E7E5E4] bg-white p-3 text-sm shadow-sm">
      <div className="mb-2 text-[#1C1917]">{q.question}</div>
      <div className="flex flex-wrap gap-2">
        {q.options.map((opt) => (
          <button
            key={opt.id + opt.label}
            type="button"
            disabled={q.answered}
            onClick={() => onPick(opt.label)}
            className="group flex flex-col items-start gap-0.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] px-3 py-1.5 text-left hover:bg-[#F5F5F4] disabled:opacity-50"
          >
            <span className="text-xs font-medium text-[#1C1917]">{opt.label}</span>
            {opt.hint && (
              <span className="text-[10px] text-[#78716C]">{opt.hint}</span>
            )}
          </button>
        ))}
      </div>
      {q.answered && (
        <div className="mt-2 text-[10px] text-[#A8A29E]">已选，继续对话中…</div>
      )}
    </div>
  );
}

function statusMeta(status: string): {
  icon: React.ReactNode;
  color: string;
  label?: string;
} {
  switch (status) {
    case "running":
      return {
        icon: <Loader2 className="h-3 w-3 animate-spin text-yellow-600" />,
        color: "text-yellow-700",
        label: "运行中",
      };
    case "ok":
      return {
        icon: <CheckCircle2 className="h-3 w-3 text-green-600" />,
        color: "text-green-700",
      };
    case "ambiguous":
      return {
        icon: <CircleAlert className="h-3 w-3 text-amber-600" />,
        color: "text-amber-700",
        label: "多候选",
      };
    case "not_found":
      return {
        icon: <CircleAlert className="h-3 w-3 text-stone-500" />,
        color: "text-stone-600",
        label: "没找到",
      };
    case "quota_exhausted":
      return {
        icon: <CircleAlert className="h-3 w-3 text-red-600" />,
        color: "text-red-700",
        label: "额度用完",
      };
    case "permission_denied":
      return {
        icon: <CircleAlert className="h-3 w-3 text-red-600" />,
        color: "text-red-700",
        label: "无权限",
      };
    case "already_done":
    case "duplicate_call":
      return {
        icon: <CheckCircle2 className="h-3 w-3 text-stone-400" />,
        color: "text-stone-500",
        label: "已执行",
      };
    case "invalid_input":
      return {
        icon: <CircleAlert className="h-3 w-3 text-amber-600" />,
        color: "text-amber-700",
        label: "参数不对",
      };
    case "error":
      return {
        icon: <CircleAlert className="h-3 w-3 text-red-600" />,
        color: "text-red-700",
        label: "错误",
      };
    default:
      return {
        icon: <Circle className="h-3 w-3 text-stone-400" />,
        color: "text-stone-600",
      };
  }
}

function ToolCallList({ tools }: { tools: ToolCallLog[] }) {
  const [open, setOpen] = useState(false);
  const running = tools.some((t) => t.status === "running");
  return (
    <div className="w-full max-w-[90%]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-[#E7E5E4] bg-white px-2.5 py-1 text-[11px] text-[#78716C] hover:bg-[#F5F5F4]"
      >
        <Wrench className={cn("h-3 w-3", running && "animate-pulse")} />
        <span>
          {running ? "正在调用工具" : `调用了 ${tools.length} 个工具`}：
          {tools.map((t) => t.name).join("、")}
        </span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1.5 space-y-2 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-2 text-[11px] text-[#44403C]">
          {tools.map((t) => {
            const m = statusMeta(t.status);
            return (
              <div key={t.id} className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  {m.icon}
                  <span className="font-mono font-medium">{t.name}</span>
                  {m.label && <span className={cn("text-[10px]", m.color)}>{m.label}</span>}
                </div>
                {Object.keys(t.input).length > 0 && (
                  <pre className="overflow-x-auto rounded bg-white/50 p-1.5 pl-3.5 text-[10px] text-[#78716C]">
                    {JSON.stringify(t.input, null, 2)}
                  </pre>
                )}
                {t.user_facing_message && (
                  <div className="pl-3.5 text-[10px] text-[#44403C]">{t.user_facing_message}</div>
                )}
                {t.candidates && t.candidates.length > 0 && (
                  <div className="pl-3.5 text-[10px] text-[#78716C]">
                    候选 {t.candidates.length}：{t.candidates.slice(0, 4).map((c) => c.label).join(" / ")}
                    {t.candidates.length > 4 ? "…" : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
