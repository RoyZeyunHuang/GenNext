/**
 * 主站 UI：仅「主站入口」用户（app_metadata.has_main_access）在内容工厂里看到「人设 RAG 库」等入口。
 * API 鉴权见 `requirePersonaRagRoute`（已登录即可）；副程序素材库不展示人设页。
 */
export function canUseRagFeature(
  session: { hasMainAccess?: boolean } | null | undefined
): boolean {
  return session?.hasMainAccess === true;
}
