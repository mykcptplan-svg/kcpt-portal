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
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<CallerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setLoading(false);
        }
        return;
      }

      try {
        const next = await getProfile(session.access_token);
        if (cancelled) return;
        setProfile(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setProfile(null);
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
    () => ({ profile, loading, error }),
    [profile, loading, error],
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
