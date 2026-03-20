"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar as CalendarIcon, Plus, Loader2 } from "lucide-react";
import type { CalendarEvent as CalendarEventType } from "@/types/dashboard";
import { addCalendarEvent } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";

function getLocalToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getLocalDateOffsetDays(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(t: string | null): string {
  if (!t) return "";
  if (t.length <= 5) return t;
  return t.slice(0, 5);
}

export function CalendarCard() {
  const { t } = useLocale();
  const [events, setEvents] = useState<CalendarEventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fetchEvents = () => {
    setLoading(true);
    const today = getLocalToday();
    const endDate = getLocalDateOffsetDays(6);
    fetch(`/api/calendar/today?date=${today}&end_date=${endDate}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setEvents(Array.isArray(d) ? d : []);
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEvents(); }, []);

  return (
    <div className="rounded-lg bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-[#1C1917]">
          <CalendarIcon className="h-4 w-4 text-[#78716C]" />
          {t("dashboard.calendarTitle")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-sm text-[#78716C]">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("common.loading")}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-[#78716C]">{t("dashboard.calendarEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="shrink-0 text-[#78716C]">
                {e.date}
                {formatTime(e.start_time) ? ` ${formatTime(e.start_time)}` : ""}
                {e.end_time ? ` - ${formatTime(e.end_time)}` : ""}
              </span>
              <span className="text-[#1C1917]">{e.title}</span>
              {e.location && <span className="text-[#78716C]">· {e.location}</span>}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <QuickAddCalendar
          onClose={() => setOpen(false)}
          onSuccess={() => { setOpen(false); fetchEvents(); }}
        />
      )}
    </div>
  );
}

function QuickAddCalendar({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const router = useRouter();
  const { t } = useLocale();
  const today = getLocalToday();

  async function submit(formData: FormData) {
    await addCalendarEvent(formData);
    router.refresh();
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-base font-semibold text-[#1C1917]">{t("dashboard.calendarAdd")}</h3>
        <form action={submit} className="space-y-3">
          <input name="title" placeholder={t("common.titlePlaceholder")} required className="w-full rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-sm text-[#1C1917] placeholder:text-[#78716C] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
          <input name="date" type="date" defaultValue={today} required className="w-full rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
          <div className="flex gap-2">
            <input name="start_time" type="time" className="w-full rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
            <input name="end_time" type="time" className="w-full rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
          </div>
          <input name="location" placeholder={t("common.locationPlaceholder")} className="w-full rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-sm text-[#1C1917] placeholder:text-[#78716C] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" className="bg-[#1C1917] text-white hover:bg-[#1C1917]/90">{t("common.add")}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
