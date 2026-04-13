"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquareHeart, Send, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_CHARS = 15;

type FeedbackItem = {
  id: string;
  content: string;
  rating: number | null;
  page: string;
  created_at: string;
};

export function FeedbackPageClient() {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<FeedbackItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [quotaReason, setQuotaReason] = useState("");
  const [requestingQuota, setRequestingQuota] = useState(false);
  const [quotaResult, setQuotaResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<{ used: number; limit: number; remaining: number | null; unlimited: boolean } | null>(null);

  const charCount = content.trim().length;
  const canSubmit = charCount >= MIN_CHARS;

  const loadHistory = useCallback(() => {
    void fetch("/api/rf/feedback")
      .then((r) => r.json())
      .then((data: FeedbackItem[] | { error?: string }) => {
        if (Array.isArray(data)) setHistory(data);
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, []);

  useEffect(() => {
    loadHistory();
    // Load quota info
    void fetch("/api/rf/me")
      .then((r) => r.json())
      .then((j: { personaGenerateUsed?: number; personaGenerateLimit?: number; personaGenerateRemaining?: number | null; personaGenerateUnlimited?: boolean }) => {
        setQuotaInfo({
          used: j.personaGenerateUsed ?? 0,
          limit: j.personaGenerateLimit ?? 15,
          remaining: j.personaGenerateRemaining ?? null,
          unlimited: j.personaGenerateUnlimited ?? false,
        });
      })
      .catch(() => {});
  }, [loadHistory]);

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
          page: "feedback_page",
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `提交失败`);
      }
      setContent("");
      setSubmitted(true);
      loadHistory();
      setTimeout(() => setSubmitted(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestQuota = async () => {
    if (requestingQuota) return;
    setRequestingQuota(true);
    setQuotaResult(null);
    try {
      const res = await fetch("/api/rf/request-quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: quotaReason.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok) throw new Error(data.error || "提交失败");
      setQuotaResult({ ok: true, msg: data.message || "申请已提交" });
      setQuotaReason("");
    } catch (e) {
      setQuotaResult({ ok: false, msg: e instanceof Error ? e.message : "提交失败" });
    } finally {
      setRequestingQuota(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-4 lg:px-6 lg:pt-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-[15px] font-bold text-[#1C1917] lg:text-lg">
          <MessageSquareHeart className="h-5 w-5 text-amber-500" />
          反馈中心
        </h1>
        <p className="mt-1 text-sm text-[#78716C]">
          你的每一条建议，都是我们前进的方向
        </p>
      </div>

      {/* Submission card */}
      <div className="rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-sm">
        <div className="mb-4 rounded-xl bg-gradient-to-br from-[#FAFAF9] to-amber-50/30 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-[#1C1917]">
                我们真的会读每一条反馈
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-[#78716C]">
                不管是功能建议、体验吐槽、还是 bug 报告，大胆说出来。
                <br />
                <span className="font-medium text-amber-600">
                  更新得会比你想象的快 ⚡
                </span>
              </p>
            </div>
          </div>
        </div>

        {submitted && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <Sparkles className="h-4 w-4" />
            已收到，感谢你的反馈!
          </div>
        )}

        <div className="relative">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="功能建议、体验反馈、或者想要的新功能，随便写…"
            className="w-full resize-none rounded-xl border border-[#E7E5E4] bg-[#FAFAF9]/50 px-4 py-3 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:border-[#D6D3D1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1C1917]/15"
          />
          <span
            className={cn(
              "absolute bottom-2.5 right-3 text-[11px] tabular-nums",
              canSubmit ? "text-emerald-600" : "text-[#A8A29E]"
            )}
          >
            {charCount}/{MIN_CHARS}
          </span>
        </div>

        {!canSubmit && charCount > 0 && (
          <p className="mt-1.5 text-[11px] text-[#A8A29E]">
            再写 {MIN_CHARS - charCount} 个字就好了
          </p>
        )}

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

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
            <>
              <Send className="h-4 w-4" />
              提交反馈
            </>
          )}
        </button>
      </div>

      {/* Request more quota */}
      {quotaInfo && !quotaInfo.unlimited && (
        <div className="mt-6 rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-4.5 w-4.5 text-amber-500" />
            <h2 className="text-[15px] font-bold text-[#1C1917]">申请更多次数</h2>
          </div>
          <p className="mb-1 text-[13px] text-[#78716C]">
            本周已使用 <span className="font-semibold text-[#1C1917]">{quotaInfo.used}</span> / {quotaInfo.limit} 次黑魔法生成
            {quotaInfo.remaining !== null && quotaInfo.remaining > 0 && (
              <span className="text-emerald-600">（剩余 {quotaInfo.remaining} 次）</span>
            )}
            {quotaInfo.remaining === 0 && (
              <span className="text-red-500">（已用完）</span>
            )}
          </p>
          <p className="mb-3 text-[12px] text-[#A8A29E]">
            每次申请批准后增加 15 次，管理员通常很快处理
          </p>

          <textarea
            value={quotaReason}
            onChange={(e) => setQuotaReason(e.target.value)}
            rows={2}
            maxLength={200}
            placeholder="简单说明需要更多次数的原因（选填）"
            className="w-full resize-none rounded-xl border border-[#E7E5E4] bg-[#FAFAF9]/50 px-4 py-2.5 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:border-[#D6D3D1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1C1917]/15"
          />

          {quotaResult && (
            <p className={cn("mt-2 text-xs", quotaResult.ok ? "text-emerald-600" : "text-red-600")}>
              {quotaResult.msg}
            </p>
          )}

          <button
            type="button"
            disabled={requestingQuota}
            onClick={() => void handleRequestQuota()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50"
          >
            {requestingQuota ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                提交中…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                申请 +15 次
              </>
            )}
          </button>
        </div>
      )}

      {/* History */}
      <div className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#A8A29E]">
          我的反馈记录
        </h2>

        {loadingHistory && (
          <div className="flex items-center gap-2 py-6 text-sm text-[#A8A29E]">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        )}

        {!loadingHistory && history.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#E7E5E4] bg-[#FAFAF9] px-4 py-8 text-center">
            <MessageSquareHeart className="mx-auto mb-2 h-6 w-6 text-[#D6D3D1]" />
            <p className="text-sm text-[#A8A29E]">还没有提交过反馈</p>
            <p className="mt-0.5 text-xs text-[#D6D3D1]">
              在上面写下你的想法吧
            </p>
          </div>
        )}

        {!loadingHistory && history.length > 0 && (
          <div className="space-y-3">
            {history.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-[#E7E5E4] bg-white px-4 py-3"
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#44403C]">
                  {item.content}
                </p>
                <p className="mt-2 text-[11px] text-[#A8A29E]">
                  {new Date(item.created_at).toLocaleString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
