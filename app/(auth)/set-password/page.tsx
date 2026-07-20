"use client";

import { useState } from "react";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    setSubmitting(true);
    // TODO(Milestone 1a): call supabase.auth.updateUser via an Edge Function
    // once the invite link's redirectTo session is verified. See AGENTS.md
    // for the inviteUserByEmail() flow this screen completes.
    setTimeout(() => setSubmitting(false), 600);
  }

  return (
    <div className="flex flex-col items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/heart-mark.png" alt="" width={48} height={48} />
      <h1 className="font-heading mt-4 text-xl uppercase tracking-wide text-foreground">
        Welcome to KCPT
      </h1>
      <p className="mt-1 text-center text-sm text-muted">
        Set a password to finish creating your account.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex w-full flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-medium text-muted">
            Password
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
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter your password"
            className="h-11 rounded-md border border-border bg-transparent px-3 text-sm text-foreground placeholder:text-muted focus:border-brand-orange focus:outline-none"
          />
          {mismatch && (
            <p className="text-xs text-brand-orange-dark">
              Passwords don&apos;t match.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || mismatch || password.length < 8}
          className="mt-2 h-11 rounded-md bg-brand-orange text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Setting up…" : "Set password & continue"}
        </button>
      </form>
    </div>
  );
}
