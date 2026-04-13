"use client";

import { useState } from "react";
import { Loader2, MessageSquareHeart, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_CHARS = 15;

export function FeedbackModal({
  onSubmitted,
}: {
  /** Called after successful submission — parent should clear the feedbackRequired flag */
  onSubmitted: () => void;
}) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const charCount = content.trim().length;
  const canSubmit = charCount >= MIN_CHARS;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/rf/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          page: "forced_modal",
          metadata: { trigger: "generation_count_threshold" },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `提交失败 HTTP ${res.status}`);
      }
      setDone(true);
      setTimeout(() => onSubmitted(), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-[#E7E5E4] bg-white shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#1C1917] to-[#44403C] px-6 py-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
            <MessageSquareHeart className="h-6 w-6 text-amber-300" />
          </div>
          <h2 className="text-lg font-bold text-white">
            {done ? "感谢你的反馈!" : "告诉我们你的想法"}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">
            {done
              ? "你的声音我们已收到"
              : "你的每一条建议，都在帮我们变得更好"}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 pt-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Sparkles className="h-8 w-8 text-amber-500" />
              <p className="text-sm font-medium text-[#44403C]">
                更新得会比你想象的快
              </p>
            </div>
          ) : (
            <>
              <div className="relative">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="有什么想吐槽的？有什么想要的功能？大胆说，我们真的会看每一条…"
                  className="w-full resize-none rounded-xl border border-[#E7E5E4] bg-[#FAFAF9] px-4 py-3 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:border-[#D6D3D1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1C1917]/15"
                  autoFocus
                />
                <span
                  className={cn(
                    "absolute bottom-2 right-3 text-[11px] tabular-nums transition-colors",
                    canSubmit ? "text-emerald-600" : "text-[#A8A29E]"
                  )}
                >
                  {charCount}/{MIN_CHARS}
                </span>
              </div>

              {!canSubmit && charCount > 0 && (
                <p className="mt-1.5 text-[11px] text-[#A8A29E]">
                  再写 {MIN_CHARS - charCount} 个字就可以提交了
                </p>
              )}

              {error && (
                <p className="mt-2 text-xs text-red-600">{error}</p>
              )}

              <button
                type="button"
                disabled={!canSubmit || submitting}
                onClick={() => void handleSubmit()}
                className={cn(
                  "mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all",
                  canSubmit
                    ? "bg-[#1C1917] text-white hover:bg-[#1C1917]/90 active:scale-[0.98]"
                    : "cursor-not-allowed bg-[#E7E5E4] text-[#A8A29E]"
                )}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    提交中…
                  </>
                ) : (
                  "提交反馈"
                )}
              </button>

              <p className="mt-3 text-center text-[11px] leading-relaxed text-[#A8A29E]">
                使用 {MIN_CHARS} 字以上描述你的体验、需求或吐槽
                <br />
                <span className="text-amber-600/80">更新得会比你想象的快 ⚡</span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
