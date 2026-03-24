import { readFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";

/**
 * 校验路径落在 `public/` 下（防穿越），返回相对 public 的路径（POSIX 风格便于拼 URL）
 */
export function assertSafePublicRelativePath(attachmentPath: string): string {
  const trimmed = attachmentPath.trim();
  if (!trimmed) throw new Error("附件路径为空");

  const publicDir = path.join(process.cwd(), "public");
  const resolved = path.resolve(publicDir, trimmed);
  const normalizedPublic = path.resolve(publicDir);
  if (!resolved.startsWith(normalizedPublic + path.sep) && resolved !== normalizedPublic) {
    throw new Error("附件路径必须在 public 目录内");
  }
  return path.relative(normalizedPublic, resolved).replace(/\\/g, "/");
}

/**
 * 读取 `public/` 下文件。
 *
 * - 优先本地磁盘（本地 `next dev`、部分 Node 部署有效）。
 * - 若不存在（常见于 Vercel：静态资源不在函数文件系统），则依次用站点根 URL 拉取：
 *   `NEXT_PUBLIC_APP_URL`、`VERCEL_URL`、开发环境 `localhost`。
 */
export async function readPublicFileBytes(attachmentPath: string): Promise<{
  buffer: Buffer;
  fileName: string;
}> {
  const relativePosix = assertSafePublicRelativePath(attachmentPath);
  const fileName = path.posix.basename(relativePosix) || relativePosix;
  const absDisk = path.join(process.cwd(), "public", ...relativePosix.split("/"));

  try {
    if (existsSync(absDisk) && statSync(absDisk).isFile()) {
      const buffer = await readFile(absDisk);
      return { buffer, fileName };
    }
  } catch {
    // 走 URL 回退
  }

  const bases = [
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, ""),
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.NODE_ENV === "development"
      ? `http://127.0.0.1:${process.env.PORT || 3000}`
      : null,
  ].filter((x): x is string => Boolean(x));

  const urlPath = relativePosix.split("/").map(encodeURIComponent).join("/");
  let lastErr: Error | null = null;

  for (const base of bases) {
    const url = `${base}/${urlPath}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        return { buffer: Buffer.from(await res.arrayBuffer()), fileName };
      }
      lastErr = new Error(`GET ${url} → ${res.status}`);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw new Error(
    lastErr
      ? `无法读取附件 public/${relativePosix}：${lastErr.message}。本地请确认文件存在；线上请在 .env 设置 NEXT_PUBLIC_APP_URL 为站点根地址（如 https://your-domain.com）。`
      : `无法读取附件 public/${relativePosix}。请配置 NEXT_PUBLIC_APP_URL。`
  );
}
