"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

type NotesKpi = {
  total_notes: number;
  total_exposure: number;
  avg_cover_ctr: number;
  avg_watch_time: number;
};

function formatShortNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_0000_0000) return (value / 1_0000_0000).toFixed(1).replace(/\.0$/, "") + "亿";
  if (value >= 1_0000) return (value / 1_0000).toFixed(1).replace(/\.0$/, "") + "万";
  return value.toLocaleString();
}

export function MonthlyOverviewCard() {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<NotesKpi | null>(null);

  useEffect(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const y = now.getFullYear();
    const yearStart = `${y}-01-01`;

    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          from_date: yearStart,
          to_date: todayStr,
          _cb: String(Date.now()),
        });
        const res = await fetch(`/api/kpi/notes-comparison?${params}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        const cur = data?.current;
        if (cur && typeof cur.total_notes === "number") {
          setKpi({
            total_notes: cur.total_notes,
            total_exposure: Number(cur.total_exposure) || 0,
            avg_cover_ctr: Number(cur.avg_cover_ctr) || 0,
            avg_watch_time: Number(cur.avg_watch_time) || 0,
          });
        } else {
          setKpi(null);
        }
      } catch {
        setKpi(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const hasData =
    kpi != null &&
    (kpi.total_notes > 0 ||
      kpi.total_exposure > 0 ||
      kpi.avg_cover_ctr > 0 ||
      kpi.avg_watch_time > 0);

  return (
    <div className="rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-[#1C1917]">
        <BarChart3 className="h-4 w-4 text-[#78716C]" />
        {t("dashboard.notesYearKpiTitle")}
      </h3>
      {loading ? (
        <p className="text-xs text-[#78716C]">{t("common.loading")}</p>
      ) : !hasData ? (
        <a href="/kpi" className="text-xs text-blue-600 hover:underline">
          {t("dashboard.notesYearKpiUpload")}
        </a>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-[#FAFAF9] p-3">
            <div className="text-xs text-gray-400">{t("dashboard.notesYearKpiNotes")}</div>
            <div className="text-xl font-bold text-[#1C1917]">{kpi!.total_notes.toLocaleString()}</div>
            <div className="text-xs text-gray-400">{t("dashboard.unitPiece")}</div>
          </div>
          <div className="rounded-lg bg-[#FAFAF9] p-3">
            <div className="text-xs text-gray-400">{t("dashboard.notesYearKpiExposure")}</div>
            <div className="text-xl font-bold text-[#1C1917]">{formatShortNumber(kpi!.total_exposure)}</div>
            <div className="text-xs text-gray-400">{t("dashboard.unitExposure")}</div>
          </div>
          <div className="rounded-lg bg-[#FAFAF9] p-3">
            <div className="text-xs text-gray-400">{t("dashboard.notesYearKpiCoverCtr")}</div>
            <div className="text-xl font-bold text-[#1C1917]">
              {(kpi!.avg_cover_ctr * 100).toFixed(2)}%
            </div>
            <div className="text-xs text-gray-400">&nbsp;</div>
          </div>
          <div className="rounded-lg bg-[#FAFAF9] p-3">
            <div className="text-xs text-gray-400">{t("dashboard.notesYearKpiWatchTime")}</div>
            <div className="text-xl font-bold text-[#1C1917]">
              {kpi!.avg_watch_time.toFixed(1)} {t("dashboard.unitSeconds")}
            </div>
            <div className="text-xs text-gray-400">&nbsp;</div>
          </div>
        </div>
      )}
    </div>
  );
}
