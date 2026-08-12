"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError("Incorrect email or password. Please try again.");
        return;
      }
      router.push("/");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );
      if (resetError) {
        setError(resetError.message || "Could not send reset link.");
        return;
      }
      setResetSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function showForgot() {
    setForgotMode(true);
    setResetSent(false);
    setError(null);
    setPassword("");
  }

  function showLogin() {
    setForgotMode(false);
    setResetSent(false);
    setError(null);
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
        {forgotMode ? "Reset password" : "Log in"}
      </h1>
      <p className="mt-1 text-center text-sm text-muted">
        {forgotMode
          ? "Enter your email and we'll send a reset link."
          : "Welcome back to your KCPT plan."}
      </p>

      {forgotMode ? (
        resetSent ? (
          <div className="mt-8 flex w-full flex-col gap-4">
            <p className="text-center text-sm text-muted">
              If an account exists for that email, we sent a reset link.
              Don&apos;t see it? Check your Spam or Junk folder.
            </p>
            <button
              type="button"
              onClick={showLogin}
              className="h-11 rounded-md bg-brand-orange text-sm font-medium text-black transition-opacity hover:opacity-90"
            >
              Back to log in
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleResetSubmit}
            className="mt-8 flex w-full flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reset-email" className="text-xs font-medium text-muted">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-md border border-border bg-transparent px-3 text-sm text-foreground placeholder:text-muted focus:border-brand-orange focus:outline-none"
              />
            </div>

            {error && (
              <p className="text-xs text-brand-orange-dark">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 h-11 rounded-md bg-brand-orange text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send reset link"}
            </button>

            <button
              type="button"
              onClick={showLogin}
              className="text-center text-xs text-muted transition-colors hover:text-foreground"
            >
              Back to log in
            </button>
          </form>
        )
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 flex w-full flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11 rounded-md border border-border bg-transparent px-3 text-sm text-foreground placeholder:text-muted focus:border-brand-orange focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="password" className="text-xs font-medium text-muted">
                Password
              </label>
              <button
                type="button"
                onClick={showForgot}
                className="text-xs text-muted transition-colors hover:text-brand-orange"
              >
                Forgot password?
              </button>
            </div>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 rounded-md border border-border bg-transparent px-3 text-sm text-foreground placeholder:text-muted focus:border-brand-orange focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-xs text-brand-orange-dark">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 h-11 rounded-md bg-brand-orange text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-muted">
        New members join by invite from Kelly — check your email for a link
        to set up your account.
      </p>
    </div>
  );
}
