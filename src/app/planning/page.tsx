import { PlanningClient } from "@/components/planning/PlanningClient";
import { PageHeader } from "@/components/PageHeader";

export default function PlanningPage() {
  return (
    <div className="p-6">
      <PageHeader titleKey="planning.title" subtitleKey="planning.subtitle" pageTitleKey="pages.planning" />
      <PlanningClient />
    </div>
  );
}
