/** 与 `public/profileimages/*.png` 文件名对应（竖版头像，UI 用 object-top 裁成正方形再圆形显示）。 */
const KNOWN_FILES = [
  "Aurora",
  "Caesy",
  "Cammy",
  "Freya",
  "Kelvin",
  "Luke",
  "Mia",
  "Ray",
  "Sabrina",
] as const;

/**
 * 返回人设头像静态路径，或 null（无对应文件时用首字母占位）。
 */
export function getPersonaProfileImageSrc(name: string): string | null {
  const t = name.trim();
  if (!t) return null;
  if ((KNOWN_FILES as readonly string[]).includes(t)) {
    return `/profileimages/${t}.png`;
  }
  const hit = KNOWN_FILES.find((k) => k.toLowerCase() === t.toLowerCase());
  return hit ? `/profileimages/${hit}.png` : null;
}
