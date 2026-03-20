import { ContentFactoryClient } from "@/components/documents/ContentFactoryClient";
import { PageHeader } from "@/components/PageHeader";

export default function DocumentsPage() {
  return (
    <div className="p-6">
      <PageHeader titleKey="documents.title" subtitleKey="documents.subtitle" pageTitleKey="pages.documents" />
      <ContentFactoryClient />
    </div>
  );
}
