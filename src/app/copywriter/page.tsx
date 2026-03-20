import { CopywriterClient } from "@/components/copywriter/CopywriterClient";
import { PageHeader } from "@/components/PageHeader";

export default function CopywriterPage() {
  return (
    <div className="p-6">
      <PageHeader titleKey="copywriter.title" subtitleKey="copywriter.subtitle" pageTitleKey="pages.copywriter" />
      <CopywriterClient />
    </div>
  );
}
