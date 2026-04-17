"use client";

/**
 * 违禁词查词（参考零克查词）
 *
 * - 左侧：大文本框，粘贴即实时高亮（textarea + overlay 分层）
 * - 右侧：风险等级统计 + 命中词列表（聚合 phrase，显示出现次数与来源分类）
 * - 词库：@/data/xhs-forbidden-words.json（总表 + 房产/医疗/虚假宣传等专项）
 *
 * 纯前端扫描，结果仅供参考。
 */

import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { CheckCircle2, Copy, Eraser, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  scanXhsForbidden,
  segmentsForHighlight,
  riskLevelBadgeClass,
  riskLevelMarkClass,
  riskLevelLabel,
  type ForbiddenHit,
  type RiskLevel,
  type ScanResult,
} from "@/lib/xhsForbiddenScan";
import dict from "@/data/xhs-forbidden-words.json";

type DictEntry = { phrase: string; level: RiskLevel; source: string };
const DICT_ENTRIES: DictEntry[] = (dict as { entries: DictEntry[] }).entries;
const DICT_SIZE = DICT_ENTRIES.length;

type HitAgg = {
  phrase: string;
  level: RiskLevel;
  source: string;
  count: number;
  firstAt: number;
};

const RANK: Record<RiskLevel, number> = { high: 3, medium: 2, low: 1 };

function aggregateHits(hits: ForbiddenHit[]): HitAgg[] {
  const sourceByPhrase = new Map<string, string>();
  for (const e of DICT_ENTRIES) sourceByPhrase.set(e.phrase, e.source);

  const map = new Map<string, HitAgg>();
  for (const h of hits) {
    const ex = map.get(h.phrase);
    if (ex) {
      ex.count += 1;
      if (h.start < ex.firstAt) ex.firstAt = h.start;
    } else {
      map.set(h.phrase, {
        phrase: h.phrase,
        level: h.level,
        source: sourceByPhrase.get(h.phrase) ?? "其他",
        count: 1,
        firstAt: h.start,
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => RANK[b.level] - RANK[a.level] || a.firstAt - b.firstAt
  );
}

/** sessionStorage key——别的页（比如小黑 chat）可以把要查的文本塞这里跳转过来 */
export const FORBIDDEN_WORDS_PREFILL_KEY = "forbidden_words_prefill";

export function ForbiddenWordsClient() {
  const [text, setText] = useState("");
  const [scan, setScan] = useState<ScanResult>({ hits: [], levelAt: [] });
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // 挂载时检查 sessionStorage 有没有预填文本（从小黑 chat 跳过来的场景）
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const prefill = window.sessionStorage.getItem(FORBIDDEN_WORDS_PREFILL_KEY);
      if (prefill) {
        setText(prefill);
        window.sessionStorage.removeItem(FORBIDDEN_WORDS_PREFILL_KEY);
      }
    } catch {
      /* sessionStorage 可能被禁，忽略 */
    }
  }, []);

  // 防抖扫描（120ms），避免大文本每个字符都跑一遍 786 条 phrase
  useEffect(() => {
    if (!text) {
      setScan({ hits: [], levelAt: [] });
      return;
    }
    const id = window.setTimeout(() => setScan(scanXhsForbidden(text)), 120);
    return () => window.clearTimeout(id);
  }, [text]);

  const aggregated = useMemo(() => aggregateHits(scan.hits), [scan]);
  const stats = useMemo(() => {
    const s = { high: 0, medium: 0, low: 0, total: scan.hits.length };
    for (const h of scan.hits) s[h.level] += 1;
    return s;
  }, [scan.hits]);

  const segments = useMemo(
    () => (text ? segmentsForHighlight(text, scan.levelAt) : []),
    [text, scan.levelAt]
  );

  const handleCopy = async () => {
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setText("");
    textareaRef.current?.focus();
  };

  const handleScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    if (overlayRef.current) {
      overlayRef.current.scrollTop = e.currentTarget.scrollTop;
      overlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const placeholder = `粘贴或输入你的文案…

实时检测违禁词（${DICT_SIZE} 条词库，含小红书总表 + 房产/医疗/虚假宣传等专项）
🔴 红：高风险（可能限流或违规）
🟠 橙：中风险（夸大/诱导表述）
🟡 黄：低风险（保守建议替换）`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      {/* 左：文本框 + 操作栏 */}
      <div className="flex flex-col space-y-3">
        <div className="relative rounded-xl border border-[#E7E5E4] bg-white shadow-sm">
          {/* 高亮 overlay：只显示 mark 背景，文字透明；scroll 与 textarea 同步 */}
          <div
            ref={overlayRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words p-5 font-sans text-[15px] leading-7 text-transparent"
          >
            {segments.length > 0
              ? segments.map((s, i) => {
                  const chunk = text.slice(s.start, s.end);
                  if (!s.level) return <span key={i}>{chunk}</span>;
                  return (
                    <mark
                      key={i}
                      className={cn(
                        "rounded-[3px] !text-transparent",
                        riskLevelMarkClass(s.level)
                      )}
                    >
                      {chunk}
                    </mark>
                  );
                })
              : text}
            {/* 保证结尾换行也能被覆盖到，避免光标行与 overlay 错位 */}
            {text.endsWith("\n") && "\u00A0"}
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onScroll={handleScroll}
            placeholder={placeholder}
            rows={14}
            spellCheck={false}
            className="relative block w-full resize-none break-words bg-transparent p-5 font-sans text-[15px] leading-7 text-[#1C1917] caret-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-[#78716C]">
            <span>
              字数{" "}
              <span className="font-semibold text-[#1C1917]">{text.length}</span>
            </span>
            <span className="h-3 w-px bg-[#E7E5E4]" aria-hidden />
            <span>
              命中{" "}
              <span className="font-semibold text-[#1C1917]">{stats.total}</span>
            </span>
            <span className="h-3 w-px bg-[#E7E5E4]" aria-hidden />
            <span>
              不同词条{" "}
              <span className="font-semibold text-[#1C1917]">{aggregated.length}</span>
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClear}
              disabled={!text}
              className="flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-white px-3 py-1.5 text-xs text-[#78716C] transition hover:border-[#D6D3D1] hover:text-[#1C1917] disabled:opacity-50"
            >
              <Eraser className="h-3.5 w-3.5" /> 清空
            </button>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!text.trim()}
              className="flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-white px-3 py-1.5 text-xs text-[#78716C] transition hover:border-[#D6D3D1] hover:text-[#1C1917] disabled:opacity-50"
            >
              {copied ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "已复制" : "复制原文"}
            </button>
          </div>
        </div>
      </div>

      {/* 右：统计 + 命中列表 */}
      <aside className="flex flex-col space-y-4">
        <div className="rounded-xl border border-[#E7E5E4] bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[#78716C]" />
            <h2 className="text-sm font-semibold text-[#1C1917]">风险统计</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatPill level="high" label="高风险" count={stats.high} />
            <StatPill level="medium" label="中风险" count={stats.medium} />
            <StatPill level="low" label="低风险" count={stats.low} />
          </div>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white shadow-sm">
          <div className="border-b border-[#E7E5E4] px-5 py-3">
            <h2 className="text-sm font-semibold text-[#1C1917]">命中列表</h2>
            <p className="mt-0.5 text-[11px] text-[#A8A29E]">
              {aggregated.length > 0
                ? `共 ${aggregated.length} 个不同词条，按风险等级排序`
                : text
                  ? "未命中任何违禁词 🎉"
                  : "粘贴文本后自动扫描"}
            </p>
          </div>
          <ul className="max-h-[55vh] divide-y divide-[#F5F5F4] overflow-y-auto">
            {aggregated.map((h) => (
              <li key={h.phrase} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                          riskLevelBadgeClass(h.level)
                        )}
                      >
                        {riskLevelLabel(h.level)}
                      </span>
                      <span className="text-[11px] text-[#A8A29E]">· {h.source}</span>
                    </div>
                    <div className="mt-1 break-all text-sm font-medium text-[#1C1917]">
                      {h.phrase}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-[#78716C]">×{h.count}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] leading-relaxed text-[#A8A29E]">
          词库 {DICT_SIZE} 条，含小红书官方总表 + 房产/医疗/化妆品/虚假宣传等补充。
          结果仅供参考，发布前请人工复核。
        </p>
      </aside>
    </div>
  );
}

function StatPill({
  level,
  label,
  count,
}: {
  level: RiskLevel;
  label: string;
  count: number;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2 py-2 text-center",
        riskLevelBadgeClass(level)
      )}
    >
      <div className="text-[10px] font-medium">{label}</div>
      <div className="mt-0.5 text-lg font-semibold leading-none">{count}</div>
    </div>
  );
}
