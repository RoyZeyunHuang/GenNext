import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ForbiddenWordsClient } from "@/components/forbidden-words/ForbiddenWordsClient";
import { getRfSession } from "@/lib/rf-session";

export default async function ForbiddenWordsPage() {
  const session = await getRfSession();
  if (!session) redirect("/rednote-factory/login?next=/forbidden-words");

  return (
    <div className="p-6">
      <PageHeader
        titleKey="forbiddenWords.title"
        subtitleKey="forbiddenWords.subtitle"
        pageTitleKey="pages.forbiddenWords"
      />
      <ForbiddenWordsClient />
    </div>
  );
}
