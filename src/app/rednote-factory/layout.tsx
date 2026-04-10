import type { Viewport } from "next";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { RednoteFactoryShell } from "@/components/rednote-factory/RednoteFactoryShell";

/** 避免 iOS 在输入框聚焦时自动放大 viewport，避免用户需双指缩回 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RednoteFactoryRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <LocaleProvider>
      <RednoteFactoryShell>{children}</RednoteFactoryShell>
    </LocaleProvider>
  );
}
