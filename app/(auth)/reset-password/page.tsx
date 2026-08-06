"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const RESET_LINK_ERROR =
  "Reset link is invalid or expired. Request a new one from the login screen.";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center">
          <p className="mt-8 text-sm text-muted">Verifying your link…</p>
        </div>
      }
    >
      <ResetPasswordPageInner />
    </Suspense>
  );
}

function ResetPasswordPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function establishRecoverySession() {
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      if (tokenHash && type === "recovery") {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (cancelled) return;
        if (verifyError) {
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
  }, [searchParams, supabase]);

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
