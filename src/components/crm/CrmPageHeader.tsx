"use client";

import { useEffect } from "react";
import { useLocale } from "@/contexts/LocaleContext";

export function CrmPageHeader() {
  const { t } = useLocale();
  useEffect(() => {
    const title = t("pages.crm");
    document.title = title ? `${title} | Ops Hub` : "Ops Hub";
    return () => { document.title = "Ops Hub"; };
  }, [t]);
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-[#1C1917]">{t("crm.title")}</h1>
      <p className="mt-1 text-sm text-[#78716C]">{t("crm.subtitle")}</p>
    </div>
  );
}
