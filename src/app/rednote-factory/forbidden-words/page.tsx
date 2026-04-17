import { redirect } from "next/navigation";
import { ForbiddenWordsClient } from "@/components/forbidden-words/ForbiddenWordsClient";
import { getRfSession } from "@/lib/rf-session";

export default async function RednoteFactoryForbiddenWordsPage() {
  const session = await getRfSession();
  if (!session) {
    redirect("/rednote-factory/login?next=/rednote-factory/forbidden-words");
  }

  return (
    <div className="flex flex-col gap-3 p-4 lg:p-6">
      <div>
        <h1 className="text-lg font-semibold text-[#1C1917]">违禁词查词</h1>
        <p className="text-xs text-[#78716C]">粘贴文案或从小黑对话送过来，实时高亮小红书敏感词。</p>
      </div>
      <ForbiddenWordsClient />
    </div>
  );
}
