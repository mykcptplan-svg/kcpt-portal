/**
 * Thin API client for the discard-next-week-draft Edge Function.
 *
 * See lib/ensureNextWeekDraft.ts for the create-if-missing counterpart
 * (used by the Tracker's "Start Next Week's Plan" button).
 */
const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/discard-next-week-draft`;

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

export async function discardNextWeekDraft(accessToken: string): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to discard draft");
  }
}
