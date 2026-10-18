/**
 * Thin API client for the member-plan Edge Function.
 *
 * Callers must already have a valid Supabase session access token.
 * Throws on error. A failed fetch (network down) throws a TypeError, a
 * non-2xx response throws an Error carrying the server's message.
 *
 * No retry, caching, or debounce here.
 */
import {
  PLAN_FIELD_KEYS,
  type PlanFieldKey,
  type PlanFields,
} from "@/lib/kcptPlan";

/** Members get user_id + content; admins also get updated_at / updated_by. */
export type MemberPlan = Record<PlanFieldKey, string | null> & {
  user_id: string;
  updated_at?: string;
  updated_by?: string | null;
};

const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/member-plan`;

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

/** Own plan when userId is omitted. Another user's plan is admin only. */
export async function getMemberPlan(
  accessToken: string,
  userId?: string,
): Promise<MemberPlan | null> {
  const url =
    userId !== undefined
      ? `${ENDPOINT}?user_id=${encodeURIComponent(userId)}`
      : ENDPOINT;

  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to load plan");
  }

  const body = (await res.json()) as { data: MemberPlan | null };
  return body.data ?? null;
}

/** Admin only. Sends user_id plus all 14 content keys, nothing else. */
export async function saveMemberPlan(
  accessToken: string,
  userId: string,
  fields: PlanFields,
): Promise<MemberPlan> {
  const payload: Record<string, string | null> = { user_id: userId };
  for (const key of PLAN_FIELD_KEYS) {
    payload[key] = fields[key];
  }

  const res = await fetch(ENDPOINT, {
    method: "PUT",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to save plan");
  }

  const body = (await res.json()) as { data: MemberPlan };
  return body.data;
}
