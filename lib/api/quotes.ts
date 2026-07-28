/**
 * Thin API client for motivational-quotes Edge Function.
 *
 * Callers must already have a valid Supabase session access token.
 * Throws on error — the caller handles UI error/loading state.
 */

export type MotivationalQuote = {
  id: string;
  body: string;
  is_active: boolean;
  created_at: string;
};

const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/motivational-quotes`;

function authHeaders(
  accessToken: string,
  withJson = false,
): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
  if (withJson) headers["Content-Type"] = "application/json";
  return headers;
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

export async function listQuotes(
  accessToken: string,
): Promise<MotivationalQuote[]> {
  const res = await fetch(ENDPOINT, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to load quotes");
  }

  const body = (await res.json()) as { data: MotivationalQuote[] };
  return body.data;
}

export async function createQuote(
  accessToken: string,
  body: string,
  isActive = true,
): Promise<MotivationalQuote> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ body, is_active: isActive }),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to create quote");
  }

  const payload = (await res.json()) as { data: MotivationalQuote };
  return payload.data;
}

export async function updateQuote(
  accessToken: string,
  patch: { id: string; body?: string; is_active?: boolean },
): Promise<MotivationalQuote> {
  const res = await fetch(ENDPOINT, {
    method: "PATCH",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to update quote");
  }

  const payload = (await res.json()) as { data: MotivationalQuote };
  return payload.data;
}

export async function deleteQuote(
  accessToken: string,
  id: string,
): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: "DELETE",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ id }),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to delete quote");
  }
}
