/**
 * RAG 人设链路：与中间件一致，仅「主站入口」用户（app_metadata.has_main_access）可用。
 * Rednote 子站无该权限的用户不会看到 tab，API 返回 403。
 */
export function canUseRagFeature(
  session: { hasMainAccess?: boolean } | null | undefined
): boolean {
  return session?.hasMainAccess === true;
}
