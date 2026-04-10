import { redirect } from "next/navigation";

/** RF 已下线「创作」入口，旧链接跳转到黑魔法 */
export default function RednoteFactoryCopywriterPage() {
  redirect("/rednote-factory/copywriter-rag");
}
