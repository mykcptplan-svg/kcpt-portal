/**
 * Thin API client for the weekly-base-plan Edge Function.
 *
 * Callers (client components) must already have a valid Supabase session
 * access token. Get it via lib/supabase/client.ts, then pass it in:
 *
 *   import { createClient } from "@/lib/supabase/client";
 *   import { getWeeklyBasePlan, saveWeeklyBasePlan } from "@/lib/api/basePlan";
 *
 *   const supabase = createClient();
 *   const { data: { session } } = await supabase.auth.getSession();
 *   if (!session) throw new Error("Not logged in");
 *   const plan = await getWeeklyBasePlan("2026-07-20", session.access_token);
 *   await saveWeeklyBasePlan(
 *     { week_start: "2026-07-20", ...formState },
 *     session.access_token,
 *   );
 *
 * Both functions throw on error — the caller is responsible for try/catch
 * and UI error/loading state (same pattern as app/(auth)/set-password/page.tsx).
 *
 * No retry, caching, or debounce here — that belongs in an autosave hook
 * that wraps these calls later.
 */
import type { WeeklyBasePlan } from "@/types";

const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/weekly-base-plan`;

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

export async function getWeeklyBasePlan(
  weekStart: string,
  accessToken: string,
  userId?: string,
): Promise<WeeklyBasePlan | null> {
  const params = new URLSearchParams({ week_start: weekStart });
  if (userId !== undefined) {
    params.set("user_id", userId);
  }

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to load base plan");
  }

  const body = (await res.json()) as { data: WeeklyBasePlan | null };
  return body.data;
}

export async function saveWeeklyBasePlan(
  plan: Omit<WeeklyBasePlan, "user_id">,
  accessToken: string,
): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: "PUT",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(plan),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to save base plan");
  }
}
