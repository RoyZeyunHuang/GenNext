"use client";

import { useEffect } from "react";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  titleKey: string;
  subtitleKey?: string;
  /** 若提供，会设置 document.title（用于浏览器标签页） */
  pageTitleKey?: string;
  /** 浏览器标签后缀，默认 GenNext（RednoteFactory 子应用可传 RednoteFactory） */
  browserTitleSuffix?: string;
};

export function PageHeader({
  titleKey,
  subtitleKey,
  pageTitleKey,
  browserTitleSuffix = "GenNext",
}: Props) {
  const { t } = useLocale();
  useEffect(() => {
    if (!pageTitleKey) return;
    const title = t(pageTitleKey);
    document.title = title ? `${title} | ${browserTitleSuffix}` : browserTitleSuffix;
    return () => {
      document.title = "GenNext";
    };
  }, [pageTitleKey, t, browserTitleSuffix]);
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-[#1C1917]">{t(titleKey)}</h1>
      {subtitleKey && (
        <p className="mt-1 text-sm text-[#78716C]">{t(subtitleKey)}</p>
      )}
    </div>
  );
}
