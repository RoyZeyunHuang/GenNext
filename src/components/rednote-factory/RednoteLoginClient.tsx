"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/contexts/LocaleContext";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith("/")) return null;
  if (next === "/rednote-factory/login" || next.startsWith("/rednote-factory/login/")) return null;
  return next;
}

function RednoteLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const [mode, setMode] = useState<"signIn" | "signUp" | "forgotPassword">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${t("rednote.pages.login")} | RednoteFactory`;
    return () => {
      document.title = "GenNext";
    };
  }, [t]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const next = safeNextPath(searchParams.get("next"));
        if (next) {
          router.replace(next);
        } else {
          const hasMain = user.app_metadata?.has_main_access === true;
          router.replace(hasMain ? "/" : "/rednote-factory/copywriter");
        }
      }
    });
  }, [router, searchParams]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setMessage(null);
      setLoading(true);
      try {
        const supabase = createSupabaseBrowserClient();
        if (mode === "forgotPassword") {
          const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${window.location.origin}/rednote-factory/reset-password`,
          });
          if (err) {
            setError(t("rednote.authError"));
            return;
          }
          setMessage(t("rednote.resetEmailSent"));
          return;
        }
        if (mode === "signIn") {
          const { data, error: err } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (err) {
            setError(t("rednote.authError"));
            return;
          }
          const next = safeNextPath(searchParams.get("next"));
          if (next) {
            router.push(next);
          } else {
            const hasMain = data.user?.app_metadata?.has_main_access === true;
            router.push(hasMain ? "/" : "/rednote-factory/copywriter");
          }
          router.refresh();
        } else {
          const trimmedEmail = email.trim();
          try {
            const checkRes = await fetch("/api/auth/email-registered", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: trimmedEmail }),
            });
            if (checkRes.ok) {
              const check = (await checkRes.json()) as {
                registered?: boolean | null;
                skipped?: boolean;
              };
              if (check.registered === true) {
                setError(t("rednote.emailAlreadyRegistered"));
                return;
              }
            }
          } catch {
            /* 预检失败则继续走 signUp，由 identities 兜底 */
          }

          const { data, error: err } = await supabase.auth.signUp({
            email: trimmedEmail,
            password,
          });
          if (err) {
            const msg = (err.message ?? "").toLowerCase();
            if (
              msg.includes("already") ||
              msg.includes("registered") ||
              msg.includes("exists") ||
              err.status === 422
            ) {
              setError(t("rednote.emailAlreadyRegistered"));
            } else {
              setError(t("rednote.signUpError"));
            }
            return;
          }
          const identities = data.user?.identities;
          if (data.user && (!identities || identities.length === 0)) {
            await supabase.auth.signOut();
            setError(t("rednote.emailAlreadyRegistered"));
            return;
          }
          if (data.session) {
            const next = safeNextPath(searchParams.get("next"));
            router.push(next ?? "/rednote-factory/copywriter");
            router.refresh();
            return;
          }
          setMessage(t("rednote.signUpCheckEmail"));
          setMode("signIn");
        }
      } finally {
        setLoading(false);
      }
    },
    [email, password, mode, router, searchParams, t]
  );

  const switchMode = (next: "signIn" | "signUp" | "forgotPassword") => {
    setMode(next);
    setError(null);
    setMessage(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAFAF9] px-7 pb-16">
      <div className="w-full max-w-[400px]">
        <div className="mb-9 text-center">
          <div className="text-[30px] font-black tracking-[2px] text-[#1C1917]">REDNOTE</div>
          <div className="mt-1 text-[11px] font-medium tracking-[1.5px] text-[#A8A29E]">FACTORY</div>
        </div>

        <form className="w-full space-y-0" onSubmit={submit}>
          <label htmlFor="rf-email" className="mb-1.5 block text-xs font-semibold text-[#78716C]">
            {t("rednote.email")}
          </label>
          <input
            id="rf-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-3.5 h-[46px] w-full rounded-[10px] border border-[#E7E5E4] bg-white px-3.5 text-[15px] text-[#1C1917] outline-none focus:ring-2 focus:ring-[#1C1917]/20"
          />
          {mode !== "forgotPassword" && (
            <>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor="rf-password" className="block text-xs font-semibold text-[#78716C]">
                  {t("rednote.password")}
                </label>
                {mode === "signIn" && (
                  <button
                    type="button"
                    className="text-xs font-medium text-[#1C1917] underline-offset-2 hover:underline"
                    onClick={() => switchMode("forgotPassword")}
                  >
                    {t("rednote.forgotPassword")}
                  </button>
                )}
              </div>
              <input
                id="rf-password"
                type="password"
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mb-3.5 h-[46px] w-full rounded-[10px] border border-[#E7E5E4] bg-white px-3.5 text-[15px] text-[#1C1917] outline-none focus:ring-2 focus:ring-[#1C1917]/20"
              />
            </>
          )}

          {error && (
            <p className="mb-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="mb-2 text-sm text-emerald-700" role="status">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1.5 h-12 w-full rounded-[10px] bg-[#1C1917] text-[15px] font-semibold text-white transition hover:bg-[#292524] disabled:opacity-60"
          >
            {loading
              ? t("common.loading")
              : mode === "forgotPassword"
                ? t("rednote.sendResetEmail")
                : mode === "signIn"
                  ? t("rednote.signIn")
                  : t("rednote.signUp")}
          </button>
        </form>

        <p className="mt-7 text-center text-xs text-[#A8A29E]">{t("rednote.adminContact")}</p>

        <p className="mt-4 text-center text-sm text-[#78716C]">
          {mode === "forgotPassword" ? (
            <button
              type="button"
              className="font-medium text-[#1C1917] underline-offset-2 hover:underline"
              onClick={() => switchMode("signIn")}
            >
              {t("rednote.backToLogin")}
            </button>
          ) : mode === "signIn" ? (
            <button
              type="button"
              className="font-medium text-[#1C1917] underline-offset-2 hover:underline"
              onClick={() => switchMode("signUp")}
            >
              {t("rednote.needAccount")}
            </button>
          ) : (
            <button
              type="button"
              className="font-medium text-[#1C1917] underline-offset-2 hover:underline"
              onClick={() => switchMode("signIn")}
            >
              {t("rednote.alreadyHaveAccount")}
            </button>
          )}
        </p>
      </div>
    </div>
  );
}

export function RednoteLoginClient() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#FAFAF9] text-sm text-[#78716C]">…</div>}>
      <RednoteLoginForm />
    </Suspense>
  );
}
