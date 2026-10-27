/**
 * Thin API client for the coaching-notes Edge Function.
 *
 * Callers must already have a valid Supabase session access token.
 * Throws on error. A failed fetch (network down) throws a TypeError, a
 * non-2xx response throws an Error carrying the server's message.
 *
 * Members read their own VISIBLE notes (getMyCoachingNotes). The admin reads,
 * writes and deletes any member's notes. The server and RLS are the real guard.
 *
 * No retry, caching, or debounce here.
 */
import type { CoachingNote, MemberCoachingNote } from "@/types";

const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/coaching-notes`;

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

/** The caller's own visible notes, newest first (id, note, dates only). */
export async function getMyCoachingNotes(
  accessToken: string,
  limit?: number,
): Promise<MemberCoachingNote[]> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  const query = params.toString();

  const res = await fetch(query ? `${ENDPOINT}?${query}` : ENDPOINT, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to load notes");
  }

  const body = (await res.json()) as { data?: MemberCoachingNote[] };
  return body.data ?? [];
}

/** Admin only: every note (private and visible) about a member, newest first. */
export async function getMemberCoachingNotes(
  accessToken: string,
  userId: string,
  limit?: number,
): Promise<CoachingNote[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (limit !== undefined) params.set("limit", String(limit));

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to load notes");
  }

  const body = (await res.json()) as { data?: CoachingNote[] };
  return body.data ?? [];
}

/** Admin only. visibleToMember defaults to false (private) on the server. */
export async function createCoachingNote(
  accessToken: string,
  entry: { userId: string; note: string; visibleToMember?: boolean },
): Promise<CoachingNote> {
  const payload: Record<string, unknown> = {
    user_id: entry.userId,
    note: entry.note,
  };
  if (entry.visibleToMember !== undefined) {
    payload.visible_to_member = entry.visibleToMember;
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to save note");
  }

  const body = (await res.json()) as { data: CoachingNote };
  return body.data;
}

/** Admin only. Send only the fields that changed. */
export async function updateCoachingNote(
  accessToken: string,
  id: string,
  patch: { note?: string; visibleToMember?: boolean },
): Promise<CoachingNote> {
  const payload: Record<string, unknown> = {};
  if (patch.note !== undefined) payload.note = patch.note;
  if (patch.visibleToMember !== undefined) {
    payload.visible_to_member = patch.visibleToMember;
  }

  const res = await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to update note");
  }

  const body = (await res.json()) as { data: CoachingNote };
  return body.data;
}

/** Admin only. */
export async function deleteCoachingNote(
  accessToken: string,
  id: string,
): Promise<void> {
  const res = await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, "Unable to delete note");
  }
}

/**
 * True when the note text was edited after it was created. The database only
 * moves updated_at when the note text changes (not when visibility is toggled).
 */
export function isNoteEdited(note: {
  created_at: string;
  updated_at: string;
}): boolean {
  return Date.parse(note.updated_at) > Date.parse(note.created_at);
}
