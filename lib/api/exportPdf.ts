/**
 * Thin API client for the export-week-pdf Edge Function.
 *
 * Returns a PDF Blob for the caller's own week. Throws on non-OK.
 */
const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/export-week-pdf`;

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
    // ignore parse failures (e.g. non-JSON body)
  }
  return new Error(fallback);
}

export async function exportWeekPdf(
  weekStart: string,
  accessToken: string,
): Promise<Blob> {
  const params = new URLSearchParams({ week_start: weekStart });
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to download week PDF");
  }

  return res.blob();
}
