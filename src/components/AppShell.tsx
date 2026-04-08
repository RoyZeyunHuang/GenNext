"use client";

import { usePathname } from "next/navigation";
import { LayoutWithSidebar } from "@/components/LayoutWithSidebar";
import { AIAssistant } from "@/components/AIAssistant";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRednoteFactory = pathname?.startsWith("/rednote-factory") ?? false;

  if (isRednoteFactory) {
    return <>{children}</>;
  }

  return (
    <>
      <LayoutWithSidebar>{children}</LayoutWithSidebar>
      <AIAssistant />
    </>
  );
}
