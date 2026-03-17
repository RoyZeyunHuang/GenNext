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

const navItems = [
  { href: "/dashboard", label: "概览", icon: LayoutDashboard },
  { href: "/documents", label: "内容工厂", icon: FolderOpen },
  { href: "/copywriter", label: "内容创作", icon: PenLine },
  { href: "/planning", label: "内容排期", icon: CalendarRange },
  { href: "/calendar", label: "AI日历", icon: Calendar },
  { href: "/crm", label: "BRM", icon: Users },
  { href: "/kpi", label: "KPI", icon: BarChart3 },
  { href: "/news", label: "新闻摘要", icon: Newspaper },
  { href: "/settings", label: "设置", icon: Settings },
] as const;

type Locale = "zh" | "en";

export function Sidebar({
  locale = "zh",
  onLocaleChange,
}: {
  locale?: Locale;
  onLocaleChange?: (locale: Locale) => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-[#E7E5E4] bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-[#E7E5E4] px-4">
        <span className="text-lg font-semibold tracking-tight text-[#1C1917]">
          Ops Hub
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 flex flex-col">
        <div className="flex-1">
        {navItems.slice(0, -1).map(({ href, label, icon: Icon }) => {
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
              {label}
            </Link>
          );
        })}
        </div>
        <div className="mt-auto border-t border-[#E7E5E4] pt-2">
        {navItems.slice(-1).map(({ href, label, icon: Icon }) => {
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
              {label}
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
            onClick={() => onLocaleChange?.("zh")}
          >
            <Languages className="h-4 w-4" />
            中文
          </Button>
          <Button
            variant={locale === "en" ? "secondary" : "ghost"}
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => onLocaleChange?.("en")}
          >
            <Languages className="h-4 w-4" />
            EN
          </Button>
        </div>
      </div>
    </aside>
  );
}
