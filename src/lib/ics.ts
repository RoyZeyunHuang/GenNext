export type IcsEvent = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
};

function escapeIcs(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function toIcsDateTime(dateStr: string, timeStr: string): string {
  const d = dateStr.replace(/-/g, "");
  const t = timeStr.replace(":", "").padEnd(4, "0").slice(0, 4) + "00";
  return `${d}T${t}`;
}

export function buildIcsContent(events: IcsEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GenNext//Calendar//EN",
    "CALSCALE:GREGORIAN",
  ];
  events.forEach((evt, i) => {
    const uid = `ops-${Date.now()}-${i}@ops-hub`;
    const dtstamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "00Z";
    const dtStart = toIcsDateTime(evt.date || "19700101", evt.startTime || "0000");
    const dtEnd = toIcsDateTime(evt.date || "19700101", evt.endTime || "2359");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${escapeIcs(evt.title || "未命名")}`);
    if (evt.location) lines.push(`LOCATION:${escapeIcs(evt.location)}`);
    if (evt.description) lines.push(`DESCRIPTION:${escapeIcs(evt.description)}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(events: IcsEvent[], filename?: string): void {
  const name = filename || `ops-calendar-${new Date().toISOString().split("T")[0]}.ics`;
  const content = buildIcsContent(events);
  const blob = new Blob(["\ufeff" + content], { type: "text/calendar; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
