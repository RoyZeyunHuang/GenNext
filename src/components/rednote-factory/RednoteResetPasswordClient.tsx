"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

function RednoteResetPasswordForm() {
  const router = useRouter();
  const { t } = useLocale();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${t("rednote.pages.resetPassword")} | RednoteFactory`;
    return () => {
      document.title = "GenNext";
    };
  }, [t]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let settled = false;

    const finish = (hasSession: boolean) => {
      if (cancelled || settled) return;
      settled = true;
      setChecking(false);
      setReady(hasSession);
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session &&
        (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED")
      ) {
        finish(true);
      }
    });

    const timer = window.setTimeout(() => {
      void supabase.auth.getSession().then(({ data: { session } }) => {
        finish(!!session);
      });
    }, 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (password.length < 6) {
        setError(t("rednote.signUpError"));
        return;
      }
      if (password !== confirm) {
        setError(t("rednote.passwordsMismatch"));
        return;
      }
      setLoading(true);
      try {
        const supabase = createSupabaseBrowserClient();
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) {
          setError(err.message || t("rednote.signUpError"));
          return;
        }
        router.replace("/rednote-factory/copywriter");
        router.refresh();
      } finally {
        setLoading(false);
      }
    },
    [confirm, password, router, t]
  );

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF9] text-sm text-[#78716C]">
        {t("common.loading")}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAFAF9] px-7 pb-16">
        <p className="max-w-[400px] text-center text-sm leading-relaxed text-[#78716C]">
          {t("rednote.resetLinkInvalid")}
        </p>
        <Link
          href="/rednote-factory/login"
          className="mt-6 text-sm font-medium text-[#1C1917] underline-offset-2 hover:underline"
        >
          {t("rednote.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAFAF9] px-7 pb-16">
      <div className="w-full max-w-[400px]">
        <div className="mb-9 text-center">
          <div className="text-[30px] font-black tracking-[2px] text-[#1C1917]">REDNOTE</div>
          <div className="mt-1 text-[11px] font-medium tracking-[1.5px] text-[#A8A29E]">FACTORY</div>
        </div>
        <h1 className="mb-6 text-center text-base font-semibold text-[#1C1917]">{t("rednote.resetPasswordTitle")}</h1>
        <form className="w-full space-y-0" onSubmit={submit}>
          <label htmlFor="rf-new-password" className="mb-1.5 block text-xs font-semibold text-[#78716C]">
            {t("rednote.newPassword")}
          </label>
          <input
            id="rf-new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-3.5 h-[46px] w-full rounded-[10px] border border-[#E7E5E4] bg-white px-3.5 text-[15px] text-[#1C1917] outline-none focus:ring-2 focus:ring-[#1C1917]/20"
          />
          <label htmlFor="rf-confirm-password" className="mb-1.5 block text-xs font-semibold text-[#78716C]">
            {t("rednote.confirmPassword")}
          </label>
          <input
            id="rf-confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mb-3.5 h-[46px] w-full rounded-[10px] border border-[#E7E5E4] bg-white px-3.5 text-[15px] text-[#1C1917] outline-none focus:ring-2 focus:ring-[#1C1917]/20"
          />
          {error && (
            <p className="mb-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-1.5 h-12 w-full rounded-[10px] bg-[#1C1917] text-[15px] font-semibold text-white transition hover:bg-[#292524] disabled:opacity-60"
          >
            {loading ? t("common.loading") : t("rednote.resetPasswordSubmit")}
          </button>
        </form>
        <p className="mt-7 text-center">
          <Link
            href="/rednote-factory/login"
            className="text-sm font-medium text-[#78716C] underline-offset-2 hover:text-[#1C1917] hover:underline"
          >
            {t("rednote.backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}

export function RednoteResetPasswordClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAFAF9] text-sm text-[#78716C]">…</div>
      }
    >
      <RednoteResetPasswordForm />
    </Suspense>
  );
}
