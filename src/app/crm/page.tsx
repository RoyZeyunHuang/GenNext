import { Suspense } from "react";
import { CrmClient } from "@/components/crm/CrmClient";
import { CrmPageHeader } from "@/components/crm/CrmPageHeader";

export default function CrmPage() {
  return (
    <div className="p-6">
      <CrmPageHeader />
      <Suspense>
        <CrmClient />
      </Suspense>
    </div>
  );
}
