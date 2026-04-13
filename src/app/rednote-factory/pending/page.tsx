"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, LogOut, RefreshCw } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function PendingPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/rednote-factory/login");
        return;
      }
      setEmail(user.email ?? null);
      // If already approved, redirect out
      if (user.app_metadata?.rf_approved === true) {
        router.replace("/rednote-factory/copywriter-rag");
      }
    });
  }, [router]);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const supabase = createSupabaseBrowserClient();
      // Force refresh session to pick up updated app_metadata
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.app_metadata?.rf_approved === true) {
        router.replace("/rednote-factory/copywriter-rag");
        router.refresh();
      }
    } finally {
      setChecking(false);
    }
  }, [router]);

  const signOut = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/rednote-factory/login");
    router.refresh();
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F5F4] px-5">
      <div className="w-full max-w-[420px] text-center">
        <div className="mb-8">
          <div className="text-[30px] font-black tracking-[2px] text-[#1C1917]">REDNOTE</div>
          <div className="mt-1 text-[11px] font-medium tracking-[1.5px] text-[#A8A29E]">FACTORY</div>
        </div>

        <div className="rounded-2xl border border-[#E7E5E4]/80 bg-white p-8 shadow-[0_2px_12px_-4px_rgba(28,25,23,0.08)]">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-200/50">
            <Clock className="h-7 w-7 text-amber-500" />
          </div>

          <h1 className="text-lg font-bold text-[#1C1917]">申请审核中</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#78716C]">
            你的账号 {email && <span className="font-medium text-[#44403C]">{email}</span>} 正在等待审核。
            <br />
            审核通过后我们会发邮件通知你。
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void checkStatus()}
              disabled={checking}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1C1917] py-3 text-sm font-semibold text-white transition hover:bg-[#292524] active:scale-[0.99] disabled:opacity-55"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "检查中…" : "检查审核状态"}
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#E7E5E4] py-3 text-sm font-medium text-[#57534E] transition hover:bg-[#F5F5F4]"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </div>
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-[#A8A29E]">
          审核一般在 24 小时内完成
        </p>
      </div>
    </div>
  );
}
