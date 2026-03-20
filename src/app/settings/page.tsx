import { SettingsClient } from "@/components/settings/SettingsClient";
import { PageHeader } from "@/components/PageHeader";

export default function SettingsPage() {
  return (
    <div className="p-6">
      <PageHeader titleKey="settings.title" subtitleKey="settings.subtitle" pageTitleKey="pages.settings" />
      <SettingsClient />
    </div>
  );
}
