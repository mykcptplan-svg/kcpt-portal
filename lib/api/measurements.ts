/**
 * Thin API client for the weight-measurements Edge Function.
 *
 * Callers (client components) must already have a valid Supabase session
 * access token. Get it via lib/supabase/client.ts, then pass it in:
 *
 *   import { createClient } from "@/lib/supabase/client";
 *   import {
 *     getWeightMeasurement,
 *     saveWeightMeasurement,
 *   } from "@/lib/api/measurements";
 *
 *   const supabase = createClient();
 *   const { data: { session } } = await supabase.auth.getSession();
 *   if (!session) throw new Error("Not logged in");
 *   const row = await getWeightMeasurement("2026-07-20", session.access_token);
 *   await saveWeightMeasurement(
 *     { week_start: "2026-07-20", weight: 70, waist: 80, hips: 95, chest: 100 },
 *     session.access_token,
 *   );
 *
 * Both functions throw on error — the caller is responsible for try/catch
 * and UI error/loading state (same pattern as app/(auth)/set-password/page.tsx).
 *
 * No retry, caching, or debounce here — that belongs in an autosave hook
 * that wraps these calls later.
 */
import type { WeightMeasurement } from "@/types";

const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/weight-measurements`;

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

export async function getWeightMeasurement(
  weekStart: string,
  accessToken: string,
): Promise<WeightMeasurement | null> {
  const res = await fetch(
    `${ENDPOINT}?week_start=${encodeURIComponent(weekStart)}`,
    {
      method: "GET",
      headers: authHeaders(accessToken),
    },
  );

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to load measurements");
  }

  const body = (await res.json()) as { data: WeightMeasurement | null };
  return body.data;
}

export async function saveWeightMeasurement(
  measurement: Omit<WeightMeasurement, "user_id">,
  accessToken: string,
): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: "PUT",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(measurement),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to save measurements");
  }
}
