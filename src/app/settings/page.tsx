import { SettingsClient } from "@/components/settings/SettingsClient";

export default function SettingsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1917]">设置</h1>
        <p className="mt-1 text-sm text-[#78716C]">账号管理及其他配置</p>
      </div>
      <SettingsClient />
    </div>
  );
}
