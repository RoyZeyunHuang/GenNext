import { supabase } from "@/lib/supabase";
import { DocumentTitle } from "@/components/DocumentTitle";
import { DateGreeting } from "@/components/dashboard/DateGreeting";
import { CalendarCard } from "@/components/dashboard/CalendarCard";
import { BrmSummaryCard } from "@/components/dashboard/BrmSummaryCard";
import { TodosCard } from "@/components/dashboard/TodosCard";
import { MonthlyOverviewCard } from "@/components/dashboard/MonthlyOverviewCard";
import { DashboardNewsBlock } from "@/components/dashboard/DashboardNewsBlock";

/** 为 false 时隐藏「📊 本月数据概览」等 KPI 相关卡片，并改用精简首页；改回 true 恢复原先 2×2 + 新闻 */
const SHOW_KPI_CARD = false;

/** 仅在精简首页（SHOW_KPI_CARD === false）生效：是否显示「今日日历」卡片 */
const SHOW_CALENDAR_CARD = false;

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
    SHOW_KPI_CARD
      ? supabase
          .from("kpi_entries")
          .select("*")
          .gte("created_at", weekStart)
          .lte("created_at", weekEnd)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="p-6">
      <DocumentTitle titleKey="pages.dashboard" />
      <div className="mb-6">
        <DateGreeting />
      </div>

      {SHOW_KPI_CARD ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CalendarCard />
            <BrmSummaryCard />
            <TodosCard todos={todos ?? []} />
            <MonthlyOverviewCard />
          </div>
          <div className="mt-6">
            <DashboardNewsBlock />
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {SHOW_CALENDAR_CARD ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <CalendarCard />
              <DashboardNewsBlock />
            </div>
          ) : (
            <DashboardNewsBlock />
          )}
          <div className="w-full">
            <TodosCard todos={todos ?? []} />
          </div>
        </div>
      )}
    </div>
  );
}
