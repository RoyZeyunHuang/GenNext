"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/contexts/LocaleContext";
import { isNystudentsNetEmail } from "@/lib/nystudents-email";
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
  const [displayName, setDisplayName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** true when the typed email is NOT nystudents.net — show application fields */
  const isExternalEmail = useMemo(() => {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) return false;
    return !isNystudentsNetEmail(trimmed);
  }, [email]);

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
          router.replace(hasMain ? "/" : "/rednote-factory/copywriter-rag");
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

        // ── Forgot password ──
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

        // ── Sign in ──
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
            router.push(hasMain ? "/" : "/rednote-factory/copywriter-rag");
          }
          router.refresh();
          return;
        }

        // ── Sign up ──
        const trimmedEmail = email.trim();

        // External email → application flow via /api/rf/apply
        if (isExternalEmail) {
          if (!displayName.trim()) {
            setError("请填写称呼");
            return;
          }
          if (!groupName.trim()) {
            setError("请填写所在组名");
            return;
          }
          const res = await fetch("/api/rf/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: trimmedEmail,
              password,
              display_name: displayName.trim(),
              group_name: groupName.trim(),
            }),
          });
          const data = (await res.json()) as { ok?: boolean; error?: string };
          if (!res.ok) {
            setError(data.error || "申请提交失败");
            return;
          }
          // Application submitted — redirect to pending page
          // Sign in first so middleware can identify the user on the pending page
          await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          });
          router.push("/rednote-factory/pending");
          router.refresh();
          return;
        }

        // nystudents.net email → direct signup (unchanged)
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
          router.push(next ?? "/rednote-factory/copywriter-rag");
          router.refresh();
          return;
        }
        setMessage(t("rednote.signUpCheckEmail"));
        setMode("signIn");
      } finally {
        setLoading(false);
      }
    },
    [email, password, displayName, groupName, isExternalEmail, mode, router, searchParams, t]
  );

  const switchMode = (next: "signIn" | "signUp" | "forgotPassword") => {
    setMode(next);
    setError(null);
    setMessage(null);
  };

  const inputClass =
    "h-12 w-full rounded-xl border border-[#E7E5E4] bg-white px-3.5 text-base text-[#1C1917] shadow-sm outline-none transition placeholder:text-[#A8A29E] focus:border-[#D6D3D1] focus:ring-2 focus:ring-[#1C1917]/15";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F5F4] px-5 pb-16 pt-4 sm:px-7">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <div className="text-[30px] font-black tracking-[2px] text-[#1C1917]">REDNOTE</div>
          <div className="mt-1 text-[11px] font-medium tracking-[1.5px] text-[#A8A29E]">FACTORY</div>
        </div>

        <div className="rounded-2xl border border-[#E7E5E4]/80 bg-white p-6 shadow-[0_2px_12px_-4px_rgba(28,25,23,0.08)] sm:p-8">
          <form className="flex w-full flex-col gap-5" onSubmit={submit}>
            <div className="space-y-1.5">
              <label htmlFor="rf-email" className="block text-xs font-semibold text-[#57534E]">
                {t("rednote.email")}
              </label>
              <input
                id="rf-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
              {mode === "signUp" && !isExternalEmail && (
                <p className="pt-0.5 text-[11px] leading-snug text-[#A8A29E]">
                  @nystudents.net / @uswoony.com 邮箱可直接注册
                </p>
              )}
              {mode === "signUp" && isExternalEmail && (
                <p className="pt-0.5 text-[11px] leading-snug text-amber-600">
                  其他邮箱需提交申请，审核通过后可使用
                </p>
              )}
            </div>

            {mode !== "forgotPassword" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="rf-password" className="block text-xs font-semibold text-[#57534E]">
                    {t("rednote.password")}
                  </label>
                  {mode === "signIn" && (
                    <button
                      type="button"
                      className="text-xs font-medium text-[#44403C] underline-offset-2 hover:text-[#1C1917] hover:underline"
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
                  className={inputClass}
                />
              </div>
            )}

            {/* Application fields — only shown for external emails during signup */}
            {mode === "signUp" && isExternalEmail && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="rf-display-name" className="block text-xs font-semibold text-[#57534E]">
                    称呼
                  </label>
                  <input
                    id="rf-display-name"
                    type="text"
                    required
                    placeholder="你的名字"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="rf-group-name" className="block text-xs font-semibold text-[#57534E]">
                    所在组名
                  </label>
                  <input
                    id="rf-group-name"
                    type="text"
                    required
                    placeholder="你所在的团队 / 组织"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {(error || message) && (
              <div className="space-y-2">
                {error && (
                  <p className="text-sm leading-relaxed text-red-600" role="alert">
                    {error}
                  </p>
                )}
                {message && (
                  <p className="text-sm leading-relaxed text-emerald-700" role="status">
                    {message}
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="min-h-12 w-full rounded-xl bg-[#1C1917] text-base font-semibold text-white shadow-sm transition hover:bg-[#292524] hover:shadow active:scale-[0.99] disabled:scale-100 disabled:opacity-55 disabled:shadow-none"
            >
              {loading
                ? t("common.loading")
                : mode === "forgotPassword"
                  ? t("rednote.sendResetEmail")
                  : mode === "signIn"
                    ? t("rednote.signIn")
                    : isExternalEmail
                      ? "提交申请"
                      : t("rednote.signUp")}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-[#A8A29E]">{t("rednote.adminContact")}</p>

        <p className="mt-3 text-center text-sm text-[#57534E]">
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
