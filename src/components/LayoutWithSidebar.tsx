"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";

export function LayoutWithSidebar({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<"zh" | "en">("zh");

  return (
    <div className="min-h-screen bg-background-secondary">
      <div className="fixed inset-y-0 left-0 z-30 w-56">
        <Sidebar locale={locale} onLocaleChange={setLocale} />
      </div>
      <main className="ml-56 min-h-screen overflow-auto bg-background-secondary">
        <div className="min-h-[calc(100vh-5rem)] pb-24">{children}</div>
      </main>
    </div>
  );
}
