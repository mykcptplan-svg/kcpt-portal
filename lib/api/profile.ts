/**
 * Thin API client for the get-profile Edge Function.
 *
 * Callers (client components) must already have a valid Supabase session
 * access token. Get it via lib/supabase/client.ts, then pass it in:
 *
 *   import { createClient } from "@/lib/supabase/client";
 *   import { getProfile } from "@/lib/api/profile";
 *
 *   const supabase = createClient();
 *   const { data: { session } } = await supabase.auth.getSession();
 *   if (!session) throw new Error("Not logged in");
 *   const profile = await getProfile(session.access_token);
 *
 * Throws on error — the caller is responsible for try/catch and UI
 * error/loading state (same pattern as app/(auth)/set-password/page.tsx).
 *
 * No retry, caching, or debounce here.
 */

export type CallerProfile = {
  full_name: string;
  status: string;
  email: string | null;
  created_at: string | null;
};

const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-profile`;

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

export async function getProfile(
  accessToken: string,
): Promise<CallerProfile> {
  const res = await fetch(ENDPOINT, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to load profile");
  }

  const body = (await res.json()) as { data: CallerProfile };
  return body.data;
}
