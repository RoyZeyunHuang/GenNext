import { Suspense } from "react";
import { CrmClient } from "@/components/crm/CrmClient";

export default function CrmPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1917]">Business Relationship Management</h1>
        <p className="mt-1 text-sm text-[#78716C]">楼盘、公司、外联追踪与 Pipeline 管理</p>
      </div>
      <Suspense>
        <CrmClient />
      </Suspense>
    </div>
  );
}
