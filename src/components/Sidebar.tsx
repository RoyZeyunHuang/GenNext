"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  PenLine,
  Calendar,
  CalendarRange,
  Users,
  BarChart3,
  Newspaper,
  Languages,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";

const navItems = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/documents", labelKey: "nav.documents", icon: FolderOpen },
  { href: "/copywriter", labelKey: "nav.copywriter", icon: PenLine },
  { href: "/planning", labelKey: "nav.planning", icon: CalendarRange },
  { href: "/calendar", labelKey: "nav.calendar", icon: Calendar },
  { href: "/crm", labelKey: "nav.crm", icon: Users },
  { href: "/kpi", labelKey: "nav.kpi", icon: BarChart3 },
  { href: "/news", labelKey: "nav.news", icon: Newspaper },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { locale, setLocale, t } = useLocale();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-[#E7E5E4] bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-[#E7E5E4] px-4">
        <span className="text-lg font-semibold tracking-tight text-[#1C1917]">
          GenNext
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col space-y-0.5 overflow-y-auto p-2">
        <div className="flex-1">
          {navItems.slice(0, -1).map(({ href, labelKey, icon: Icon }) => {
            const isActive =
              pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[#1C1917] text-white"
                    : "text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {t(labelKey)}
              </Link>
            );
          })}
        </div>
        <div className="mt-auto border-t border-[#E7E5E4] pt-2">
          {navItems.slice(-1).map(({ href, labelKey, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-[#1C1917] text-white" : "text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {t(labelKey)}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Language switch */}
      <div className="border-t border-[#E7E5E4] p-2">
        <div className="flex items-center gap-1 rounded-lg bg-[#F5F5F4] p-1">
          <Button
            variant={locale === "zh" ? "secondary" : "ghost"}
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => setLocale("zh")}
          >
            <Languages className="h-4 w-4" />
            中文
          </Button>
          <Button
            variant={locale === "en" ? "secondary" : "ghost"}
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => setLocale("en")}
          >
            <Languages className="h-4 w-4" />
            EN
          </Button>
        </div>
      </div>
    </aside>
  );
}
