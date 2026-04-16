"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Click-to-copy button with brief "✓ copied" affordance.
 * Used for WeChat snippets across building/unit cards.
 */
export function CopyButton({
  text,
  label = "复制",
  copiedLabel = "已复制",
  size = "sm",
  className,
  onCopied,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  size?: "xs" | "sm";
  className?: string;
  onCopied?: () => void;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          onCopied?.();
          setTimeout(() => setDone(false), 1600);
        } catch {
          // older browsers / file:// — fall back to prompt
          window.prompt("复制:", text);
        }
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded border bg-background hover:bg-accent active:bg-accent/80",
        size === "xs" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
        done && "border-green-500 text-green-700",
        className,
      )}
    >
      {done ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {done ? copiedLabel : label}
    </button>
  );
}
