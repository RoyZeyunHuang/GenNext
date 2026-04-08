"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** 主站侧栏 w-56 = 14rem；弹层挂 body，避免祖先 transform 把 fixed 变成「相对主内容」从而盖住全局导航 */
const Z_MODAL = 150;

type Props = {
  children: ReactNode;
  /** main：仅盖住主内容区（左侧留出全局侧栏）；fullscreen：整屏（Rednote 等） */
  variant: "main" | "fullscreen";
  className?: string;
  onBackdropClick?: (e: MouseEvent<HTMLDivElement>) => void;
};

export function MainAppModalPortal({ children, variant, className, onBackdropClick }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return createPortal(
    <div
      role="presentation"
      className={cn(
        "flex bg-black/40",
        variant === "main"
          ? "fixed bottom-0 left-56 right-0 top-0"
          : "fixed inset-0",
        className
      )}
      style={{ zIndex: Z_MODAL }}
      onClick={onBackdropClick ?? undefined}
    >
      {children}
    </div>,
    document.body
  );
}
