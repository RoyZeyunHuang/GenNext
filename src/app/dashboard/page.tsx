import { supabase } from "@/lib/supabase";
import { DateGreeting } from "@/components/dashboard/DateGreeting";
import { CalendarCard } from "@/components/dashboard/CalendarCard";
import { NewsCard } from "@/components/dashboard/NewsCard";
import { TodosCard } from "@/components/dashboard/TodosCard";
import { KpiCard } from "@/components/dashboard/KpiCard";

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

  const [
    { data: todos },
    { data: kpiEntries },
  ] = await Promise.all([
    supabase
      .from("todos")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("kpi_entries")
      .select("*")
      .gte("created_at", weekStart)
      .lte("created_at", weekEnd)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <DateGreeting />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CalendarCard />
        <NewsCard />
        <TodosCard todos={todos ?? []} />
        <KpiCard entries={kpiEntries ?? []} />
      </div>
    </div>
  );
}
