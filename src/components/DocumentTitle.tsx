"use client";

import { useEffect } from "react";
import { useLocale } from "@/contexts/LocaleContext";

/** 仅设置 document.title，不渲染任何内容。用于无 PageHeader 的页面（如 Dashboard）。 */
export function DocumentTitle({ titleKey }: { titleKey: string }) {
  const { t } = useLocale();
  useEffect(() => {
    const title = t(titleKey);
    document.title = title ? `${title} | Ops Hub` : "Ops Hub";
    return () => { document.title = "Ops Hub"; };
  }, [titleKey, t]);
  return null;
}
