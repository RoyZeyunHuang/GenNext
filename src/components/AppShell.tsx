"use client";

import { usePathname } from "next/navigation";
import { LayoutWithSidebar } from "@/components/LayoutWithSidebar";
import { AIAssistant } from "@/components/AIAssistant";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRednoteFactory = pathname?.startsWith("/rednote-factory") ?? false;
  const isStandalone = pathname === "/ga4-test";

  if (isRednoteFactory || isStandalone) {
    return <>{children}</>;
  }

  return (
    <>
      <LayoutWithSidebar>{children}</LayoutWithSidebar>
      <AIAssistant />
    </>
  );
}
