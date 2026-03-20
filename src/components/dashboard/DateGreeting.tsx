"use client";

import { useLocale } from "@/contexts/LocaleContext";

const WEEKDAY_KEYS = [
  "dashboard.weekdaySun",
  "dashboard.weekdayMon",
  "dashboard.weekdayTue",
  "dashboard.weekdayWed",
  "dashboard.weekdayThu",
  "dashboard.weekdayFri",
  "dashboard.weekdaySat",
];

function getGreetingKey(): string {
  const h = new Date().getHours();
  if (h < 12) return "dashboard.greetingMorning";
  if (h < 18) return "dashboard.greetingAfternoon";
  return "dashboard.greetingEvening";
}

export function DateGreeting() {
  const { locale, t } = useLocale();
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const weekdayLabel = t(WEEKDAY_KEYS[d.getDay()]);
  const dateLabel =
    locale === "en"
      ? `${weekdayLabel}, ${m}/${day}/${y}`
      : `${y}年${m}月${day}日 ${weekdayLabel}`;

  return (
    <div>
      <p className="text-2xl font-semibold text-[#1C1917]">{t(getGreetingKey())}</p>
      <p className="mt-1 text-sm text-[#78716C]">{dateLabel}</p>
    </div>
  );
}
