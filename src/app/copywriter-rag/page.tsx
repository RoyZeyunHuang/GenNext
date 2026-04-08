import { redirect } from "next/navigation";
import { CopywriterClientRAG } from "@/components/copywriter/CopywriterClientRAG";
import { PageHeader } from "@/components/PageHeader";
import { getRfSession } from "@/lib/rf-session";
import { canUseRagFeature } from "@/lib/persona-rag/permissions";

export default async function CopywriterRagPage() {
  const session = await getRfSession();
  if (!canUseRagFeature(session)) {
    redirect("/copywriter");
  }

  return (
    <div className="p-6">
      <PageHeader
        titleKey="copywriterRag.title"
        subtitleKey="copywriterRag.subtitle"
        pageTitleKey="pages.copywriterRag"
      />
      <CopywriterClientRAG />
    </div>
  );
}
