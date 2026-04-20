"use client";

import { usePathname } from "next/navigation";
import { RFLayout } from "./RFLayout";

export function RednoteFactoryShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (
    pathname === "/rednote-factory/login" ||
    pathname === "/rednote-factory/reset-password" ||
    pathname === "/rednote-factory/pending" ||
    pathname === "/rednote-factory/intro"
  ) {
    return <>{children}</>;
  }
  return <RFLayout>{children}</RFLayout>;
}
