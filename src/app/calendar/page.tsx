import { CalendarClient } from "@/components/calendar/CalendarClient";

export default function CalendarPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1917]">AI 日历</h1>
        <p className="mt-1 text-sm text-[#78716C]">上传日程截图或输入文字，由 AI 识别事件并导出 .ics</p>
      </div>
      <CalendarClient />
    </div>
  );
}
