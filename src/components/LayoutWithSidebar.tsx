"use client";

import { usePathname } from "next/navigation";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { Sidebar } from "@/components/Sidebar";

/** 需要"整屏 flex，无 main 滚动"外壳的路由（比如 chat）。 */
const FULL_HEIGHT_ROUTES = ["/chat"];

export function LayoutWithSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const fullHeight = FULL_HEIGHT_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <LocaleProvider>
      <div className="min-h-screen bg-background-secondary">
        <div className="fixed inset-y-0 left-0 z-30 w-56">
          <Sidebar />
        </div>
        {fullHeight ? (
          // Chat 这类页面：main 固定视口高度 + overflow-hidden，子页面用 grid / flex 自己填满
          <main className="ml-56 h-screen overflow-hidden bg-background-secondary">
            {children}
          </main>
        ) : (
          <main className="ml-56 min-h-screen overflow-auto bg-background-secondary">
            <div className="min-h-[calc(100vh-5rem)] pb-24">{children}</div>
          </main>
        )}
      </div>
    </LocaleProvider>
  );
}
