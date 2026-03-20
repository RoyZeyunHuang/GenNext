import { CalendarClient } from "@/components/calendar/CalendarClient";
import { PageHeader } from "@/components/PageHeader";

export default function CalendarPage() {
  return (
    <div className="p-6">
      <PageHeader titleKey="calendar.pageTitle" subtitleKey="calendar.subtitle" pageTitleKey="pages.calendar" />
      <CalendarClient />
    </div>
  );
}
