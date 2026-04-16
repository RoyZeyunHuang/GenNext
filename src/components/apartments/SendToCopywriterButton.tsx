"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hands off plain-text content to /copywriter via sessionStorage.
 * The copywriter page reads `apartments_prefill` once on mount and clears it.
 */
export function SendToCopywriterButton({
  content,
  label = "→ 文案工坊",
  className,
}: {
  content: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  function go() {
    if (!content?.trim()) return;
    try {
      sessionStorage.setItem("apartments_prefill", content);
    } catch {
      // sessionStorage may be unavailable (private mode etc) — fall back to query
      const q = encodeURIComponent(content.slice(0, 1500));
      router.push(`/copywriter?prefill=${q}`);
      return;
    }
    setBusy(true);
    router.push("/copywriter");
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
      <PenLine className="h-3 w-3" />
      {busy ? "打开中…" : label}
    </button>
  );
}
