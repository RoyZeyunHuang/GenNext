const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "早上好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function getTodayLabel(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const w = WEEKDAYS[d.getDay()];
  return `${y}年${m}月${day}日 ${w}`;
}

export function DateGreeting() {
  return (
    <div>
      <p className="text-2xl font-semibold text-[#1C1917]">{getGreeting()}</p>
      <p className="mt-1 text-sm text-[#78716C]">{getTodayLabel()}</p>
    </div>
  );
}
