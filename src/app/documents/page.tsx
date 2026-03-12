import { ContentFactoryClient } from "@/components/documents/ContentFactoryClient";

export default function DocumentsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1917]">内容工厂</h1>
        <p className="mt-1 text-sm text-[#78716C]">管理品牌档案、知识库、任务模板和人格模板</p>
      </div>
      <ContentFactoryClient />
    </div>
  );
}
