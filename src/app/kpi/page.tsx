import { KpiClient } from "@/components/kpi/KpiClient";
import { PageHeader } from "@/components/PageHeader";

export default function KpiPage() {
  return (
    <div className="p-6">
      <PageHeader titleKey="kpi.title" subtitleKey="kpi.subtitle" pageTitleKey="pages.kpi" />
      <KpiClient />
    </div>
  );
}
