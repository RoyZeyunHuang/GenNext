import type { Metadata } from "next";
import { AdminConflictsClient } from "@/components/admin/AdminConflictsClient";

export const metadata: Metadata = {
  title: "冲突处理",
  description: "编辑 conflicts.json 并保存后执行导入脚本",
};

export default function AdminConflictsPage() {
  return (
    <div className="p-6">
      <AdminConflictsClient />
    </div>
  );
}
