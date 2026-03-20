import { supabase } from "@/lib/supabase";
import { DocumentTitle } from "@/components/DocumentTitle";
import { DateGreeting } from "@/components/dashboard/DateGreeting";
import { CalendarCard } from "@/components/dashboard/CalendarCard";
import { BrmSummaryCard } from "@/components/dashboard/BrmSummaryCard";
import { TodosCard } from "@/components/dashboard/TodosCard";
import { MonthlyOverviewCard } from "@/components/dashboard/MonthlyOverviewCard";
import { DashboardNewsBlock } from "@/components/dashboard/DashboardNewsBlock";

function getThisWeekRange(): { start: string; end: string } {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    start: monday.toISOString(),
    end: sunday.toISOString(),
  };
}

export default async function DashboardPage() {
  const { start: weekStart, end: weekEnd } = getThisWeekRange();

  const [{ data: todos }] = await Promise.all([
    supabase.from("todos").select("*").order("created_at", { ascending: false }),
    supabase
      .from("kpi_entries")
      .select("*")
      .gte("created_at", weekStart)
      .lte("created_at", weekEnd)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="p-6">
      <DocumentTitle titleKey="pages.dashboard" />
      <div className="mb-6">
        <DateGreeting />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CalendarCard />
        <BrmSummaryCard />
        <TodosCard todos={todos ?? []} />
        <MonthlyOverviewCard />
      </div>
      <div className="mt-6">
        <DashboardNewsBlock />
      </div>
    </div>
  );
}
