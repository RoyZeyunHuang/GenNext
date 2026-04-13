"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Fingerprint, LogOut, MessageSquareHeart, Sparkles, User, type LucideIcon } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

const COPYWRITER_RAG = "/rednote-factory/copywriter-rag";
const SOUL_CUSTOMIZE = "/rednote-factory/soul-customize";
const DOCUMENTS = "/rednote-factory/documents";
const FEEDBACK = "/rednote-factory/feedback";

function TabItem({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-1 flex-col items-center gap-0.5 pt-1"
    >
      <span
        className={cn(
          "flex h-[26px] w-[26px] items-center justify-center rounded-[7px]",
          active ? "bg-[#1C1917]" : "bg-transparent"
        )}
      >
        <Icon
          className={cn("h-4 w-4", active ? "text-white" : "text-[#A8A29E]")}
          strokeWidth={2}
        />
      </span>
      <span
        className={cn(
          "text-[10px] font-medium",
          active ? "text-[#1C1917]" : "text-[#A8A29E]"
        )}
      >
        {label}
      </span>
    </Link>
  );
}

function SidebarItem({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition",
        active
          ? "bg-[#1C1917] font-medium text-white"
          : "text-[#78716C] hover:bg-[#F5F5F4]"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
      {label}
    </Link>
  );
}

export function RFLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
    });
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/rednote-factory/login");
    router.refresh();
  }, [router]);

  const onRag = pathname === COPYWRITER_RAG || pathname.startsWith(`${COPYWRITER_RAG}/`);
  const onSoul = pathname === SOUL_CUSTOMIZE || pathname.startsWith(`${SOUL_CUSTOMIZE}/`);
  const onDocs = pathname === DOCUMENTS || pathname.startsWith(`${DOCUMENTS}/`);
  const onFeedback = pathname === FEEDBACK || pathname.startsWith(`${FEEDBACK}/`);

  return (
    <div className="flex min-h-[100dvh] bg-[#e8e5e0] lg:h-[100dvh] lg:max-h-[100dvh] lg:bg-[#FAFAF9]">
      {/* Desktop sidebar */}
      <aside className="hidden w-[200px] shrink-0 flex-col border-r border-[#E7E5E4] bg-[#FAFAF9] lg:flex">
        <div className="border-b border-[#E7E5E4] px-4 py-4">
          <div className="text-base font-black tracking-wider text-[#1C1917]">
            REDNOTE
          </div>
          <div className="text-[9px] font-medium tracking-wider text-[#A8A29E]">
            FACTORY
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          <SidebarItem
            href={COPYWRITER_RAG}
            active={onRag}
            icon={Sparkles}
            label="黑魔法"
          />
          <SidebarItem
            href={SOUL_CUSTOMIZE}
            active={onSoul}
            icon={Fingerprint}
            label="灵魂定制"
          />
          <SidebarItem
            href={DOCUMENTS}
            active={onDocs}
            icon={BookOpen}
            label="素材库"
          />
          <SidebarItem
            href={FEEDBACK}
            active={onFeedback}
            icon={MessageSquareHeart}
            label="反馈"
          />
        </nav>
        <div className="space-y-2 border-t border-[#E7E5E4] p-4">
          <p className="truncate text-xs text-[#A8A29E]" title={email ?? ""}>
            {email ?? "—"}
          </p>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-white py-2 text-xs text-[#44403C] hover:bg-[#F5F5F4]"
          >
            <LogOut className="h-3.5 w-3.5" />
            退出
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col bg-white lg:bg-[#FAFAF9]">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center border-b border-[#E7E5E4] bg-white px-4 lg:hidden">
          <span className="text-[15px] font-black tracking-wide text-[#1C1917]">
            REDNOTE
            <span className="ml-1 text-[8px] font-medium tracking-wide text-[#A8A29E]">
              FACTORY
            </span>
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={signOut}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#F5F5F4] text-[#78716C]"
            aria-label="退出登录"
          >
            <User className="h-4 w-4" />
          </button>
        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto pb-[calc(68px+env(safe-area-inset-bottom,0px))] lg:pb-0">
          <div className="flex min-h-full flex-col lg:min-h-0">{children}</div>
        </main>

        {/* Mobile bottom tab */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 flex h-[68px] items-start justify-around border-t border-[#E7E5E4] bg-white pt-1.5 lg:hidden"
          style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
        >
          <TabItem
            href={COPYWRITER_RAG}
            active={onRag}
            icon={Sparkles}
            label="黑魔法"
          />
          <TabItem
            href={SOUL_CUSTOMIZE}
            active={onSoul}
            icon={Fingerprint}
            label="灵魂定制"
          />
          <TabItem
            href={DOCUMENTS}
            active={onDocs}
            icon={BookOpen}
            label="素材库"
          />
          <TabItem
            href={FEEDBACK}
            active={onFeedback}
            icon={MessageSquareHeart}
            label="反馈"
          />
        </nav>
      </div>
    </div>
  );
}
