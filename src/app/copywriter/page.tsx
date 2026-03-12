import { CopywriterClient } from "@/components/copywriter/CopywriterClient";

export default function CopywriterPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1917]">内容创作</h1>
        <p className="mt-1 text-sm text-[#78716C]">输入创作需求，AI 自动匹配素材并生成内容</p>
      </div>
      <CopywriterClient />
    </div>
  );
}
