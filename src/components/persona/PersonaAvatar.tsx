"use client";

import { cn } from "@/lib/utils";
import { getPersonaProfileImageSrc } from "@/lib/persona-profile-image";

type PersonaAvatarProps = {
  name: string;
  /** 圆形直径（px），同时作为正方形裁切区域的边长 */
  size?: number;
  className?: string;
};

/**
 * 竖版头像：以全宽为边长取上方正方形（object-cover + object-top），再显示为圆形。
 */
export function PersonaAvatar({ name, size = 40, className }: PersonaAvatarProps) {
  const src = getPersonaProfileImageSrc(name);
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-full bg-[#F5F5F4] ring-1 ring-black/[0.06]",
        className
      )}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 本地静态资源，竖图 top-crop */}
      <img
        src={src ?? "/profileimages/Profile_placeholder.png"}
        alt=""
        className="h-full w-full object-cover object-top"
      />
    </div>
  );
}
