/**
 * Thin API client for the weekly-tracker Edge Function.
 *
 * Callers (client components) must already have a valid Supabase session
 * access token. Get it via lib/supabase/client.ts, then pass it in:
 *
 *   import { createClient } from "@/lib/supabase/client";
 *   import { getWeeklyTracker, saveWeeklyTracker } from "@/lib/api/tracker";
 *
 *   const supabase = createClient();
 *   const { data: { session } } = await supabase.auth.getSession();
 *   if (!session) throw new Error("Not logged in");
 *   const entry = await getWeeklyTracker("2026-07-20", session.access_token);
 *   await saveWeeklyTracker(
 *     {
 *       week_start: "2026-07-20",
 *       habits: [...],
 *       sunday_reset_done: false,
 *       went_well: null,
 *       adjust_next: null,
 *     },
 *     session.access_token,
 *   );
 *
 * Both functions throw on error — the caller is responsible for try/catch
 * and UI error/loading state (same pattern as app/(auth)/set-password/page.tsx).
 *
 * No retry, caching, or debounce here — that belongs in an autosave hook
 * that wraps these calls later.
 */
import type { WeeklyTrackerEntry } from "@/types";

const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/weekly-tracker`;

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}

async function errorFromResponse(
  res: Response,
  fallback: string,
): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return new Error(body.error);
  } catch {
    // ignore parse failures
  }
  return new Error(fallback);
}

export async function getWeeklyTracker(
  weekStart: string,
  accessToken: string,
  userId?: string,
): Promise<WeeklyTrackerEntry | null> {
  const params = new URLSearchParams({ week_start: weekStart });
  if (userId !== undefined) {
    params.set("user_id", userId);
  }

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to load tracker");
  }

  const body = (await res.json()) as { data: WeeklyTrackerEntry | null };
  return body.data;
}

export async function saveWeeklyTracker(
  entry: Omit<WeeklyTrackerEntry, "user_id">,
  accessToken: string,
): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: "PUT",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entry),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to save tracker");
  }
}
