/**
 * Thin API client for the member-focus Edge Function.
 *
 * Callers must already have a valid Supabase session access token.
 * Throws on error. A failed fetch (network down) throws a TypeError, a
 * non-2xx response throws an Error carrying the server's message.
 *
 * No retry, caching, or debounce here.
 */
import type { MemberFocus, MemberFocusResponse } from "@/types";

const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/member-focus`;

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

/**
 * Focus in force for weekStart (a Monday) plus the 8 most recent rows.
 * Own focus when userId is omitted. Another user's focus is admin only.
 */
export async function getMemberFocus(
  weekStart: string,
  accessToken: string,
  userId?: string,
): Promise<MemberFocusResponse> {
  const params = new URLSearchParams({ week_start: weekStart });
  if (userId !== undefined) {
    params.set("user_id", userId);
  }

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to load focus");
  }

  const body = (await res.json()) as Partial<MemberFocusResponse>;
  return {
    resolved: body.resolved ?? null,
    history: body.history ?? [],
  };
}

/**
 * Members write their own focus (max 3 items, this or next Monday).
 * Admins pass userId (max 5 items, any Monday). The server derives
 * source and updated_by; they are never sent.
 */
export async function saveMemberFocus(
  accessToken: string,
  entry: { effective_week: string; items: string[]; user_id?: string },
): Promise<MemberFocus> {
  const res = await fetch(ENDPOINT, {
    method: "PUT",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify(entry),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to save focus");
  }

  const body = (await res.json()) as { data: MemberFocus };
  return body.data;
}
