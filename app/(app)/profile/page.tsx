"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOutIcon } from "@/components/icons";
import { getProfile } from "@/lib/api/profile";
import { createClient } from "@/lib/supabase/client";

function initialsFromName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "--";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session) return;

      try {
        const profile = await getProfile(session.access_token);
        if (cancelled) return;

        setFullName(profile.full_name?.trim() ?? "");
        setEmail(profile.email);
        if (profile.created_at) {
          setMemberSince(
            new Date(profile.created_at).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            }),
          );
        }
      } catch {
        if (cancelled) return;
        setEmail(session.user.email ?? null);
        if (session.user.created_at) {
          setMemberSince(
            new Date(session.user.created_at).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            }),
          );
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleLogOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  }

  const displayName = fullName || email || "…";
  const initials = fullName
    ? initialsFromName(fullName)
    : email
      ? email.slice(0, 2).toUpperCase()
      : "--";

  return (
    <div className="flex flex-1 flex-col gap-3 px-5 py-6 md:mx-auto md:w-full md:max-w-3xl md:px-10 md:py-10">
      <div>
        <h1 className="font-heading text-[32px] uppercase leading-none tracking-wide text-foreground">
          Profile
        </h1>
        <p className="mt-0.5 font-script text-xl font-bold text-brand-orange-dark">
          Your journey, your way.
        </p>
      </div>

      <div className="flex items-center gap-4 rounded-[20px] border border-border bg-card p-4 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full bg-brand-gradient font-heading text-xl tracking-wide text-white">
          {initials}
        </span>
        <div>
          <p className="text-[17px] font-extrabold text-foreground">{displayName}</p>
          {email && (
            <p className="mt-0.5 text-xs font-medium text-muted">{email}</p>
          )}
          {memberSince && (
            <p className="mt-0.5 text-xs font-medium text-muted">
              Member since {memberSince}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-[20px] border border-border bg-card p-4 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <h2 className="mb-3 font-heading text-base uppercase tracking-wide text-foreground">
          Preferences
        </h2>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-foreground">Dark Mode</p>
            <p className="mt-0.5 text-[11.5px] font-semibold text-muted">
              Coming soon
            </p>
          </div>
          <div className="relative h-[26px] w-11 shrink-0 cursor-not-allowed rounded-full bg-black/10 opacity-60">
            <div className="absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(17,17,17,0.2)]" />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleLogOut}
        disabled={signingOut}
        className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-border bg-transparent p-3 text-center transition-colors hover:bg-black/[0.03] disabled:opacity-60"
      >
        <LogOutIcon className="h-4 w-4 text-muted" />
        <span className="font-heading text-sm uppercase tracking-wide text-muted">
          {signingOut ? "Logging out…" : "Log Out"}
        </span>
      </button>

      <div className="mt-1 text-center">
        <p className="text-xs font-semibold text-muted">KCPT Portal v1.0</p>
        <p className="mt-1.5 text-[12.5px] font-medium text-muted">
          Need help? <span className="font-bold text-brand-orange">Contact Kelly</span>
        </p>
      </div>
    </div>
  );
}
