"use client";

import { usePathname } from "next/navigation";
import { RFLayout } from "./RFLayout";

export function RednoteFactoryShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/rednote-factory/login") {
    return <>{children}</>;
  }
  return <RFLayout>{children}</RFLayout>;
}
