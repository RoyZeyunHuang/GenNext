"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hands off plain-text content to a copywriter route via sessionStorage.
 * The destination page reads `apartments_prefill` once on mount and clears it.
 *
 * Defaults to /copywriter (main app); pass `targetHref` to redirect to a
 * different route (e.g. "/rednote-factory/copywriter-rag" for RF agents).
 */
export function SendToCopywriterButton({
  content,
  label = "→ 文案工坊",
  className,
  targetHref = "/copywriter",
  /** Pass `null` to render no leading icon (caller's label provides the
   *  affordance — e.g. an emoji like ✨). */
  icon,
}: {
  content: string;
  label?: string;
  className?: string;
  targetHref?: string;
  icon?: ReactNode | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const leadingIcon = icon === undefined ? <PenLine className="h-3 w-3" /> : icon;

  function go() {
    if (!content?.trim()) return;
    try {
      sessionStorage.setItem("apartments_prefill", content);
    } catch {
      // sessionStorage may be unavailable (private mode etc) — fall back to query
      const q = encodeURIComponent(content.slice(0, 1500));
      router.push(`${targetHref}?prefill=${q}`);
      return;
    }
    setBusy(true);
    router.push(targetHref);
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      title="把内容发到文案工坊生成推介稿"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent active:bg-accent/80",
        busy && "opacity-60",
        className,
      )}
    >
      {leadingIcon}
      {busy ? "打开中…" : label}
    </button>
  );
}
