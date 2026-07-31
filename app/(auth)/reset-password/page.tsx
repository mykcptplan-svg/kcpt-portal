"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const RESET_LINK_ERROR =
  "Reset link is invalid or expired. Request a new one from the login screen.";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [success, setSuccess] = useState(false);

  // Same temporary bridge as /set-password: resetPasswordForEmail() delivers
  // tokens in the URL hash (implicit flow: #access_token=...&refresh_token=...
  // &type=recovery), but @supabase/ssr's createBrowserClient defaults to PKCE
  // and expects ?code=. Auto detectSessionInUrl rejects the hash tokens, so we
  // manually setSession from the hash. See /set-password for the long-term fix
  // note (server-side /auth/confirm route, needs custom SMTP + verified domain).
  useEffect(() => {
    let cancelled = false;

    async function establishRecoverySession() {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (access_token && refresh_token) {
        const { error: setErrorResult } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (cancelled) return;
        if (setErrorResult) {
          setError(RESET_LINK_ERROR);
          return;
        }
        window.history.replaceState(null, "", window.location.pathname);
        setSessionReady(true);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setSessionReady(true);
        return;
      }

      setError(RESET_LINK_ERROR);
    }

    void establishRecoverySession();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionReady || mismatch || password.length < 8) return;

    setError(null);
    setSubmitting(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(updateError.message || "Could not reset password.");
        return;
      }

      setSuccess(true);
      window.setTimeout(() => router.push("/"), 1500);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/heart-mark.png"
        alt=""
        width={112}
        height={112}
        className="drop-shadow-[0_6px_16px_rgba(236,74,49,0.3)]"
      />
      <h1 className="font-heading mt-4 text-xl uppercase tracking-wide text-foreground">
        Reset Password
      </h1>
      <p className="mt-1 text-center text-sm text-muted">
        Choose a new password for your KCPT account.
      </p>

      {!sessionReady && !error && (
        <p className="mt-8 text-sm text-muted">Verifying your link…</p>
      )}

      {!sessionReady && error && (
        <p className="mt-8 text-xs text-brand-orange-dark">{error}</p>
      )}

      {sessionReady && success && (
        <p className="mt-8 text-center text-sm text-foreground">
          Password updated. Redirecting you to your plan…
        </p>
      )}

      {sessionReady && !success && (
        <form onSubmit={handleSubmit} className="mt-8 flex w-full flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-muted">
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="h-11 rounded-md border border-border bg-transparent px-3 text-sm text-foreground placeholder:text-muted focus:border-brand-orange focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm" className="text-xs font-medium text-muted">
              Confirm new password
            </label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your new password"
              className="h-11 rounded-md border border-border bg-transparent px-3 text-sm text-foreground placeholder:text-muted focus:border-brand-orange focus:outline-none"
            />
            {mismatch && (
              <p className="text-xs text-brand-orange-dark">
                Passwords don&apos;t match.
              </p>
            )}
          </div>

          {error && <p className="text-xs text-brand-orange-dark">{error}</p>}

          <button
            type="submit"
            disabled={submitting || mismatch || password.length < 8}
            className="mt-2 h-11 rounded-md bg-brand-orange text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Reset password"}
          </button>
        </form>
      )}
    </div>
  );
}
