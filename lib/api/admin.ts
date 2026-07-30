/**
 * Thin API client for admin member-management Edge Functions.
 *
 * Callers must already have a valid Supabase session access token.
 * Throws on error — the caller handles UI error/loading state.
 *
 * No retry, caching, or debounce here.
 */

export type MemberListItem = {
  id: string;
  full_name: string;
  email: string | null;
  status: "active" | "revoked";
  coach_review_enabled: boolean;
  role: "member";
  created_at: string;
};

export type ManageMemberBody = {
  user_id: string;
  status?: "active" | "revoked";
  coach_review_enabled?: boolean;
};

const MANAGE_ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-manage-member`;
const LIST_ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/members-list`;
const INVITE_ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-member`;

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

export async function getMembersList(
  accessToken: string,
): Promise<MemberListItem[]> {
  const res = await fetch(LIST_ENDPOINT, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to load members");
  }

  const body = (await res.json()) as { data: MemberListItem[] };
  return body.data;
}

export async function manageMember(
  accessToken: string,
  body: ManageMemberBody,
): Promise<void> {
  const res = await fetch(MANAGE_ENDPOINT, {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to update member");
  }
}

export async function inviteMember(
  accessToken: string,
  email: string,
): Promise<void> {
  const res = await fetch(INVITE_ENDPOINT, {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to send invite");
  }
}
