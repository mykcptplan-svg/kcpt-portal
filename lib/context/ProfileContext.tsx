"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getProfile, type CallerProfile } from "@/lib/api/profile";
import { createClient } from "@/lib/supabase/client";

type ProfileContextValue = {
  profile: CallerProfile | null;
  loading: boolean;
  error: string | null;
  /** Session exists but no profiles row (get-profile returns empty status). */
  needsSetup: boolean;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<CallerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (!cancelled) {
          setProfile(null);
          setError(null);
          setNeedsSetup(false);
          setLoading(false);
        }
        return;
      }

      try {
        const next = await getProfile(session.access_token);
        if (cancelled) return;
        setProfile(next);
        setError(null);
        // Missing profiles row: get-profile still returns 200 with empty status.
        setNeedsSetup(next.status.trim() === "");
      } catch (err) {
        if (cancelled) return;
        setProfile(null);
        setNeedsSetup(false);
        setError(
          err instanceof Error ? err.message : "Unable to load profile",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const value = useMemo(
    () => ({
      profile,
      loading,
      error,
      // Keep false while loading so NavShell does not flash a redirect.
      needsSetup: loading ? false : needsSetup,
    }),
    [profile, loading, error, needsSetup],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return ctx;
}
