/**
 * 计算每个联系人的 scheduled_at 时间表。
 *
 * 输入:
 *   spec = {
 *     start_at: "2026-05-11T10:00:00-04:00",
 *     per_day: 3,
 *     interval_minutes: 30,
 *     weekdays_only: true,
 *     daily_window: { start_hour: 10, end_hour: 17, tz: "America/New_York" }
 *   }
 *   count = 联系人数量
 *
 * 输出: ISO 字符串数组,长度 = count
 *
 * 算法: 从 start_at 开始,每封信间隔 interval_minutes,如果落在 daily_window 之外
 * 或当天已发满 per_day,顺延到下一可用日的 start_hour。weekdays_only 为 true 时跳过 6/7。
 *
 * 时区处理: 用 daily_window.tz 判断"当天"和"小时数"。start_at 自带 offset,直接 new Date 即可。
 */

const TZ_FORMATTER_CACHE = new Map();
function tzFormatter(tz) {
  let f = TZ_FORMATTER_CACHE.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    TZ_FORMATTER_CACHE.set(tz, f);
  }
  return f;
}

function partsInTz(date, tz) {
  const parts = tzFormatter(tz).formatToParts(date);
  const out = {};
  for (const p of parts) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour === "24" ? "0" : out.hour),
    minute: Number(out.minute),
    weekday: out.weekday, // "Mon", "Tue", ...
  };
}

const WEEKEND = new Set(["Sat", "Sun"]);

/** 给定 tz 下的 (Y,M,D,H,M),反推一个 UTC Date(贴合 daily_window 的小时) */
function makeUtcAtTz(year, month, day, hour, minute, tz) {
  // 先用 UTC 构一个候选,再调整到目标 tz 里小时一致
  // 简化做法: 用候选 ISO 字符串 + tz offset 探测 — 试两次足够
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 2; i++) {
    const got = partsInTz(candidate, tz);
    const wantUtcHour =
      hour - (got.hour - new Date(candidate).getUTCHours() + 24 * 2) % 24;
    if (got.year === year && got.month === month && got.day === day && got.hour === hour && got.minute === minute) {
      return candidate;
    }
    const diffMinutes =
      (got.hour - hour) * 60 + (got.minute - minute);
    candidate = new Date(candidate.getTime() - diffMinutes * 60_000);
  }
  return candidate;
}

function nextAvailableDay(year, month, day, tz, weekdaysOnly) {
  let d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  while (true) {
    const p = partsInTz(d, tz);
    if (!weekdaysOnly || !WEEKEND.has(p.weekday)) return p;
    d = new Date(d.getTime() + 24 * 3600_000);
  }
}

export function computeSchedule(spec, count) {
  const startAt = new Date(spec.start_at);
  if (Number.isNaN(startAt.getTime())) {
    throw new Error(`无效 start_at: ${spec.start_at}`);
  }
  const tz = spec.daily_window?.tz || "America/New_York";
  const startHour = spec.daily_window?.start_hour ?? 10;
  const endHour = spec.daily_window?.end_hour ?? 17;
  const perDay = Math.max(1, Number(spec.per_day ?? 3));
  const intervalMinutes = Math.max(1, Number(spec.interval_minutes ?? 30));
  const weekdaysOnly = spec.weekdays_only !== false;

  const out = [];
  let cursor = startAt;
  // 如果起点是周末且 weekdaysOnly,推到下周一 startHour
  {
    const p = partsInTz(cursor, tz);
    if (weekdaysOnly && WEEKEND.has(p.weekday)) {
      const nxt = nextAvailableDay(p.year, p.month, p.day + 1, tz, true);
      cursor = makeUtcAtTz(nxt.year, nxt.month, nxt.day, startHour, 0, tz);
    }
  }
  let dayPart = partsInTz(cursor, tz);
  let dayKey = `${dayPart.year}-${dayPart.month}-${dayPart.day}`;
  let sentToday = 0;
  let safetyGuard = 0;

  while (out.length < count) {
    if (++safetyGuard > count * 50) {
      throw new Error("schedule 计算死循环,检查 spec 是否合理");
    }
    const p = partsInTz(cursor, tz);
    const k = `${p.year}-${p.month}-${p.day}`;
    if (k !== dayKey) {
      dayKey = k;
      sentToday = 0;
    }
    const beforeWindow = p.hour < startHour;
    const afterWindow = p.hour >= endHour;
    const dayFull = sentToday >= perDay;
    const isWeekend = weekdaysOnly && WEEKEND.has(p.weekday);
    if (beforeWindow) {
      cursor = makeUtcAtTz(p.year, p.month, p.day, startHour, 0, tz);
      continue;
    }
    if (afterWindow || dayFull || isWeekend) {
      const nxt = nextAvailableDay(p.year, p.month, p.day + 1, tz, weekdaysOnly);
      cursor = makeUtcAtTz(nxt.year, nxt.month, nxt.day, startHour, 0, tz);
      dayKey = `${nxt.year}-${nxt.month}-${nxt.day}`;
      sentToday = 0;
      continue;
    }
    out.push(cursor.toISOString());
    sentToday += 1;
    cursor = new Date(cursor.getTime() + intervalMinutes * 60_000);
  }
  return out;
}
