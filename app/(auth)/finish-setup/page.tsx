"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function FinishSetupPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [noSession, setNoSession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          setNoSession(true);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;

        if (profile) {
          router.replace("/");
          return;
        }

        setSessionReady(true);
        return;
      }
      setNoSession(true);
    }

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const mismatch = confirm.length > 0 && password !== confirm;
  const nameReady = fullName.trim().length >= 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionReady || mismatch || password.length < 8 || !nameReady) return;

    setError(null);
    setSubmitting(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(updateError.message || "Could not set password.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("No active session. Sign in again and try once more.");
        return;
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/complete-registration`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ full_name: fullName.trim() }),
        },
      );

      if (!res.ok) {
        let message = "Could not complete registration. Please try again.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // keep generic message
        }
        setError(message);
        return;
      }

      router.push("/");
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
        Finish setting up
      </h1>
      <p className="mt-1 text-center text-sm text-muted">
        Enter your name and choose a password to finish setting up your account.
      </p>

      {!sessionReady && !noSession && (
        <p className="mt-8 text-sm text-muted">Preparing your account…</p>
      )}

      {noSession && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-center text-xs text-brand-orange-dark">
            No active session. Sign in again, or open a new invite link.
          </p>
          <Link
            href="/login"
            className="text-sm font-medium text-brand-orange hover:opacity-90"
          >
            Go to login
          </Link>
        </div>
      )}

      {sessionReady && (
        <form onSubmit={handleSubmit} className="mt-8 flex w-full flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="full-name" className="text-xs font-medium text-muted">
              Full name
            </label>
            <input
              id="full-name"
              type="text"
              required
              minLength={1}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              className="h-11 rounded-md border border-border bg-transparent px-3 text-sm text-foreground placeholder:text-muted focus:border-brand-orange focus:outline-none"
            />
          </div>

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

          {error && (
            <p className="text-xs text-brand-orange-dark">{error}</p>
          )}

          <button
            type="submit"
            disabled={
              submitting ||
              !sessionReady ||
              mismatch ||
              password.length < 8 ||
              !nameReady
            }
            className="mt-2 h-11 rounded-md bg-brand-orange text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Setting up…" : "Set password & continue"}
          </button>
        </form>
      )}
    </div>
  );
}
