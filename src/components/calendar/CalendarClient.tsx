"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, FileText, Loader2, Download, ImageIcon, Trash2, Calendar, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";
import { downloadIcs, type IcsEvent } from "@/lib/ics";

type CalendarEvent = IcsEvent & { id: string };
type HistoryEvent = {
  id: string;
  title: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  description: string | null;
  created_at: string;
};

const ACCEPT = "image/jpeg,image/png";

export function CalendarClient() {
  const { t } = useLocale();
  const [tab, setTab] = useState<"image" | "text">("text");
  const [textInput, setTextInput] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar/events");
      const data = await res.json();
      if (Array.isArray(data)) setHistory(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const clearImage = useCallback(() => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  }, [imagePreview]);

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) { clearImage(); return; }
      const type = file.type.toLowerCase();
      if (type !== "image/jpeg" && type !== "image/png") {
        setError(t("calendar.errorImageFormat"));
        return;
      }
      setError(null);
      clearImage();
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    },
    [clearImage, t]
  );

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }, [handleFile]);
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);

  const generate = async () => {
    setError(null);
    if (tab === "text" && !textInput.trim()) { setError(t("calendar.errorTextRequired")); return; }
    if (tab === "image" && !imageFile) { setError(t("calendar.errorImageRequired")); return; }
    setLoading(true);
    try {
      let body: { text?: string; imageBase64?: string; imageMediaType?: "image/jpeg" | "image/png" } = {};
      if (tab === "text") {
        body = { text: textInput.trim() };
      } else if (imageFile) {
        const base64 = await fileToBase64(imageFile);
        body = { imageBase64: base64, imageMediaType: imageFile.type === "image/png" ? "image/png" : "image/jpeg" };
      }

      const res = await fetch("/api/ai/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const list: IcsEvent[] = Array.isArray(data) ? data : [];
      const eventsWithId = list.map((e, i) => ({ ...e, id: `evt-${Date.now()}-${i}` }));
      setEvents(eventsWithId);

      // Auto-save to Supabase + auto-download .ics
      if (list.length > 0) {
        const [saveRes] = await Promise.all([
          fetch("/api/calendar/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ events: list.map((e) => ({ title: e.title, date: e.date, startTime: e.startTime, endTime: e.endTime, location: e.location, description: e.description })) }),
          }),
          Promise.resolve(downloadIcs(list)),
        ]);
        const saveData = await saveRes.json().catch(() => ({}));
        if (saveData.error) setError(t("calendar.errorSaveFailed") + ": " + saveData.error);

        fetchHistory();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("calendar.errorRecognizeFailed"));
    } finally {
      setLoading(false);
    }
  };

  const updateEvent = (id: string, field: keyof CalendarEvent, value: string) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const exportOne = (evt: CalendarEvent) => {
    downloadIcs([evt], `ops-calendar-${evt.date || "event"}.ics`);
  };

  const deleteHistory = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch("/api/calendar/events", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      setHistory((prev) => prev.filter((h) => h.id !== id));
    } catch { /* ignore */ }
    setDeletingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* left: input */}
        <div className="rounded-lg bg-white p-6 shadow-card">
          <h2 className="mb-4 text-sm font-medium text-[#1C1917]">{t("calendar.sectionTitle")}</h2>
          <div className="mb-4 flex gap-2 border-b border-[#E7E5E4]">
            <button type="button" onClick={() => setTab("image")} className={cn("flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors", tab === "image" ? "border-[#1C1917] text-[#1C1917]" : "border-transparent text-[#78716C] hover:text-[#1C1917]")}>
              <ImageIcon className="h-4 w-4" /> {t("calendar.tabImage")}
            </button>
            <button type="button" onClick={() => setTab("text")} className={cn("flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors", tab === "text" ? "border-[#1C1917] text-[#1C1917]" : "border-transparent text-[#78716C] hover:text-[#1C1917]")}>
              <FileText className="h-4 w-4" /> {t("calendar.tabText")}
            </button>
          </div>

          {tab === "image" ? (
            <div
              onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={cn("mb-4 flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-sm transition-colors", dragging ? "border-[#1C1917] bg-[#F5F5F4]" : "border-[#E7E5E4] bg-[#FAFAF9] hover:border-[#78716C]")}
            >
              <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
              {imagePreview ? (
                <div className="relative w-full max-w-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt={t("calendar.preview")} className="max-h-40 w-full rounded object-contain" onClick={(e) => e.stopPropagation()} />
                  <button type="button" onClick={(e) => { e.stopPropagation(); clearImage(); }} className="absolute right-1 top-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white hover:bg-black/80">{t("calendar.clear")}</button>
                </div>
              ) : (
                <>
                  <Upload className="mb-2 h-10 w-10 text-[#78716C]" />
                  <p className="text-[#78716C]">{t("calendar.dragHint")}</p>
                  <p className="mt-1 text-xs text-[#78716C]">{t("calendar.supportFormats")}</p>
                </>
              )}
            </div>
          ) : (
            <textarea value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder={t("calendar.placeholder")} rows={5} className="mb-4 w-full resize-none rounded-lg border border-[#E7E5E4] bg-white px-3 py-2 text-sm text-[#1C1917] placeholder:text-[#78716C] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
          )}

          <button type="button" onClick={generate} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1C1917] py-2.5 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("calendar.recognizing")}</> : t("calendar.generate")}
          </button>
          {error && <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        </div>

        {/* right: results */}
        <div className="rounded-lg bg-white p-6 shadow-card">
          <h2 className="mb-3 text-sm font-medium text-[#1C1917]">{t("calendar.resultTitle")}</h2>
          <div className="max-h-[480px] space-y-3 overflow-y-auto">
            {events.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#78716C]">{t("calendar.resultEmptyHint")}</p>
            ) : (
              events.map((evt) => (
                <EventCard key={evt.id} event={evt} onUpdate={(field, value) => updateEvent(evt.id, field, value)} onExport={() => exportOne(evt)} t={t} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* history kanban */}
      <div className="rounded-lg bg-white p-6 shadow-card">
        <div className="mb-4 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#78716C]" />
          <h2 className="text-sm font-medium text-[#1C1917]">{t("calendar.historyTitle")}</h2>
          <span className="text-xs text-[#A8A29E]">({history.length})</span>
        </div>
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#78716C]">{t("calendar.noHistory")}</p>
        ) : (
          <HistoryKanban history={history} deletingId={deletingId} onDelete={deleteHistory} t={t} />
        )}
      </div>
    </div>
  );
}

const WEEKDAY_KEYS = ["dashboard.weekdaySun", "dashboard.weekdayMon", "dashboard.weekdayTue", "dashboard.weekdayWed", "dashboard.weekdayThu", "dashboard.weekdayFri", "dashboard.weekdaySat"];

function getLocalToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatColumnDate(dateStr: string, t: (key: string) => string): string {
  const today = getLocalToday();
  const d = new Date(dateStr + "T00:00:00");
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const wd = WEEKDAY_KEYS[d.getDay()];
  if (dateStr === today) return `${t("calendar.todayLabel")} · ${month}月${day}日`;
  return `${month}月${day}日 ${t(wd)}`;
}

function HistoryKanban({ history, deletingId, onDelete, t }: { history: HistoryEvent[]; deletingId: string | null; onDelete: (id: string) => void; t: (key: string) => string }) {
  const grouped = new Map<string, HistoryEvent[]>();
  for (const h of history) {
    const key = h.date ?? "unknown";
    const arr = grouped.get(key) ?? [];
    arr.push(h);
    grouped.set(key, arr);
  }

  const today = getLocalToday();
  const allDates = Array.from(grouped.keys()).filter((d) => d !== "unknown");
  const todayArr = allDates.filter((d) => d === today);
  const future = allDates.filter((d) => d > today).sort((a, b) => a.localeCompare(b));
  const past = allDates.filter((d) => d < today).sort((a, b) => b.localeCompare(a));
  const sortedDates = [...todayArr, ...future, ...past];
  if (grouped.has("unknown")) sortedDates.push("unknown");

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {sortedDates.map((date) => {
        const items = grouped.get(date) ?? [];
        return (
          <div key={date} className="w-[240px] shrink-0">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[#1C1917]">
                {date === "unknown" ? t("calendar.unknownDate") : formatColumnDate(date, t)}
              </span>
              <span className="rounded-full bg-[#F5F5F4] px-1.5 py-0.5 text-[10px] text-[#78716C]">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((h) => (
                <div key={h.id} className="group relative rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-3">
                  <button
                    type="button"
                    onClick={() => onDelete(h.id)}
                    disabled={deletingId === h.id}
                    className="absolute right-1.5 top-1.5 rounded p-0.5 text-[#A8A29E] opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:opacity-50"
                  >
                    {deletingId === h.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  </button>
                  <p className="pr-5 text-xs font-semibold text-[#1C1917]">{h.title || <span className="italic font-normal text-[#A8A29E]">{t("calendar.noTitle")}</span>}</p>
                  {(h.start_time || h.end_time) && (
                    <p className="mt-1 text-[11px] text-[#44403C]">
                      {h.start_time && h.end_time ? `${h.start_time} - ${h.end_time}` : h.start_time || h.end_time}
                    </p>
                  )}
                  {h.location && (
                    <p className="mt-0.5 text-[11px] text-[#A8A29E]">{h.location}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventCard({ event, onUpdate, onExport, t }: { event: CalendarEvent; onUpdate: (field: keyof CalendarEvent, value: string) => void; onExport: () => void; t: (key: string) => string }) {
  const inputClass = "min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-[#1C1917] focus:border-[#E7E5E4] focus:bg-white focus:outline-none";
  return (
    <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-3">
      <div className="grid gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[#78716C]">{t("calendar.labelTitle")}</span>
          <input value={event.title} onChange={(e) => onUpdate("title", e.target.value)} className={cn(inputClass, "font-medium")} placeholder={t("calendar.placeholderEventTitle")} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[#78716C]">{t("calendar.labelDate")}</span>
            <input type="date" value={event.date} onChange={(e) => onUpdate("date", e.target.value)} className={inputClass} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[#78716C]">{t("calendar.labelStart")}</span>
            <input type="time" value={event.startTime} onChange={(e) => onUpdate("startTime", e.target.value)} className={inputClass} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[#78716C]">{t("calendar.labelEnd")}</span>
            <input type="time" value={event.endTime} onChange={(e) => onUpdate("endTime", e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[#78716C]">{t("calendar.labelLocation")}</span>
          <input value={event.location} onChange={(e) => onUpdate("location", e.target.value)} className={cn(inputClass, "flex-1")} placeholder={t("calendar.placeholderLocation")} />
        </div>
        {event.description !== undefined && (
          <div className="flex items-start gap-2">
            <span className="shrink-0 text-[#78716C]">{t("calendar.labelDescription")}</span>
            <input value={event.description} onChange={(e) => onUpdate("description", e.target.value)} className={cn(inputClass, "flex-1")} placeholder={t("calendar.placeholderDescription")} />
          </div>
        )}
        <div className="flex justify-end pt-1">
          <button type="button" onClick={onExport} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#78716C] hover:bg-[#E7E5E4] hover:text-[#1C1917]">
            <Download className="h-3.5 w-3.5" /> {t("calendar.exportOne")}
          </button>
        </div>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64 || "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
