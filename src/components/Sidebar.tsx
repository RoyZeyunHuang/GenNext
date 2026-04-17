"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  PenLine,
  Sparkles,
  ShieldAlert,
  Calendar,
  CalendarRange,
  Users,
  BarChart3,
  Newspaper,
  Languages,
  Building2,
  MessageSquare,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

const navItemsMain = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/chat", labelKey: "nav.chat", icon: MessageSquare },
  { href: "/documents", labelKey: "nav.documents", icon: FolderOpen },
  { href: "/copywriter", labelKey: "nav.copywriter", icon: PenLine },
  { href: "/copywriter-rag", labelKey: "nav.copywriterRag", icon: Sparkles },
  { href: "/forbidden-words", labelKey: "nav.forbiddenWords", icon: ShieldAlert },
] as const;

const navItemsAfterContentCreation = [
  { href: "/planning", labelKey: "nav.planning", icon: CalendarRange },
  { href: "/calendar", labelKey: "nav.calendar", icon: Calendar },
  { href: "/crm", labelKey: "nav.crm", icon: Users },
  { href: "/apartments", labelKey: "nav.apartments", icon: Building2 },
  { href: "/kpi", labelKey: "nav.kpi", icon: BarChart3 },
  { href: "/news", labelKey: "nav.news", icon: Newspaper },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
] as const;

function navLinkClick(
  e: MouseEvent<HTMLAnchorElement>,
  href: string,
  router: ReturnType<typeof useRouter>
) {
  if (e.defaultPrevented) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (e.button !== 0) return;
  e.preventDefault();
  router.push(href);
}

function navItemIsActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/dashboard") return false;
  if (href === "/copywriter" && pathname.startsWith("/copywriter-rag")) return false;
  return pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, setLocale, t } = useLocale();

  return (
    <aside data-app-sidebar className="flex h-screen w-56 flex-col border-r border-[#E7E5E4] bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-[#E7E5E4] px-4">
        <span className="text-lg font-semibold tracking-tight text-[#1C1917]">
          GenNext
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col space-y-0.5 overflow-y-auto p-2">
        <div className="flex-1">
          {navItemsMain.map(({ href, labelKey, icon: Icon }) => {
            const isActive = navItemIsActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                prefetch
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[#1C1917] text-white"
                    : "text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]"
                )}
                onClick={(e) => navLinkClick(e, href, router)}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {t(labelKey)}
              </Link>
            );
          })}
          {navItemsAfterContentCreation.slice(0, -1).map(({ href, labelKey, icon: Icon }) => {
            const isActive = navItemIsActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                prefetch
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[#1C1917] text-white"
                    : "text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]"
                )}
                onClick={(e) => navLinkClick(e, href, router)}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {t(labelKey)}
              </Link>
            );
          })}
        </div>
        <div className="mt-auto border-t border-[#E7E5E4] pt-2">
          {navItemsAfterContentCreation.slice(-1).map(({ href, labelKey, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                prefetch
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-[#1C1917] text-white" : "text-[#78716C] hover:bg-[#F5F5F4] hover:text-[#1C1917]"
                )}
                onClick={(e) => navLinkClick(e, href, router)}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {t(labelKey)}
              </Link>
            );
          })}
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#78716C] transition-colors hover:bg-[#F5F5F4] hover:text-[#1C1917]"
            onClick={async () => {
              const sb = createSupabaseBrowserClient();
              await sb.auth.signOut();
              router.push("/rednote-factory/login");
              router.refresh();
            }}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {t("nav.signOut")}
          </button>
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
