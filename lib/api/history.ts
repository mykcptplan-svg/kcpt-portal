/**
 * Thin API client for the list-weeks Edge Function.
 *
 * Callers must already have a valid Supabase session access token.
 * Throws on error — the caller handles UI error/loading state.
 *
 * No retry, caching, or debounce here.
 */

export type WeekSummary = {
  week_start: string;
  has_base_plan: boolean;
  has_tracker: boolean;
  has_measurements: boolean;
};

const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/list-weeks`;

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

export async function getWeeksList(
  accessToken: string,
  userId?: string,
): Promise<WeekSummary[]> {
  const url =
    userId !== undefined
      ? `${ENDPOINT}?user_id=${encodeURIComponent(userId)}`
      : ENDPOINT;

  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to load weeks");
  }

  const body = (await res.json()) as { data: WeekSummary[] };
  return body.data;
}
