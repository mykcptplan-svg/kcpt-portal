/**
 * coaching-notes Edge Function
 *
 * Dated coaching notes the admin writes about a member. A note is private
 * (visible_to_member = false, the default) until the admin shares it.
 *
 * GET [?user_id=<uuid>][&limit=<1..200>]
 *   - no user_id (or the caller's own id): the caller's own notes, only rows
 *     with visible_to_member = true, newest first. Member rows contain ONLY
 *     id, note, created_at, updated_at. A revoked member gets an empty list
 *     (RLS hides every row), same as member-focus.
 *   - another user's id: admin only (403 otherwise). ALL of that member's
 *     notes, private and visible, newest first, with user_id and
 *     visible_to_member.
 *   Returns { data: [...] }. limit defaults to 100, capped at 200.
 *
 * POST (admin only)
 *   { user_id, note, visible_to_member? (default false) }
 *   note is trimmed, 1 to 5000 characters. Unknown keys are rejected. The
 *   target must be a member profile (revoked allowed), else 404.
 *   Returns 201 { data: row }.
 *
 * PATCH ?id=<uuid> (admin only)
 *   { note?, visible_to_member? }, at least one. Unknown keys rejected
 *   (user_id cannot be changed). 404 if the note does not exist.
 *   Returns { data: row }.
 *
 * DELETE ?id=<uuid> (admin only)
 *   404 if not found, otherwise { data: { id } }.
 *
 * Caller JWT only (no service_role). RLS still applies. author_id is never
 * returned. created_at / updated_at / author_id are set by a database trigger.
 *
 * Notes can contain health information: request bodies and note text are
 * never logged, only error codes.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const NOTE_MAX_CHARS = 5000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

// author_id is deliberately never selected.
const MEMBER_COLUMNS = "id, note, created_at, updated_at";
const ADMIN_COLUMNS =
  "id, user_id, note, visible_to_member, created_at, updated_at";

const ALLOWED_POST_KEYS = new Set(["user_id", "note", "visible_to_member"]);
const ALLOWED_PATCH_KEYS = new Set(["note", "visible_to_member"]);

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string): string | null {
  const value = Deno.env.get(name);
  return value && value.length > 0 ? value : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function bearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/** Length in Unicode code points, matching Postgres char_length. */
function codePointLength(value: string): number {
  return [...value].length;
}

/** Validates a note value. Returns the trimmed note, or an error message. */
function parseNote(raw: unknown): { note: string } | { error: string } {
  if (typeof raw !== "string") return { error: "note must be a string" };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { error: "note must not be empty" };
  if (codePointLength(trimmed) > NOTE_MAX_CHARS) {
    return { error: `note must be at most ${NOTE_MAX_CHARS} characters` };
  }
  return { note: trimmed };
}

async function readJsonObject(
  req: Request,
): Promise<{ record: Record<string, unknown> } | { response: Response }> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return { response: jsonResponse({ error: "Invalid JSON body" }, 400) };
  }
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return {
      response: jsonResponse({ error: "Body must be a JSON object" }, 400),
    };
  }
  return { record: payload as Record<string, unknown> };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (
    req.method !== "GET" &&
    req.method !== "POST" &&
    req.method !== "PATCH" &&
    req.method !== "DELETE"
  ) {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("coaching-notes: missing required environment configuration");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const token = bearerToken(req);
  if (!token) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser(token);

  if (userError || !user) {
    console.error("coaching-notes: invalid caller session", userError);
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  // True only for an active admin: profiles RLS hides the row of a revoked
  // caller (so a revoked admin reads as not-admin), and the coaching_notes
  // policies also require is_admin().
  async function callerIsAdmin(): Promise<boolean | "error"> {
    const { data: callerProfile, error: callerProfileError } =
      await callerClient
        .from("profiles")
        .select("role")
        .eq("id", user!.id)
        .maybeSingle();

    if (callerProfileError) {
      console.error("coaching-notes: caller profile lookup failed");
      return "error";
    }
    return callerProfile?.role === "admin";
  }

  try {
    const isAdmin = await callerIsAdmin();
    if (isAdmin === "error") {
      return jsonResponse({ error: "Unable to process request" }, 500);
    }

    const url = new URL(req.url);

    // ------------------------------------------------------------------ GET
    if (req.method === "GET") {
      let limit = DEFAULT_LIMIT;
      const rawLimit = url.searchParams.get("limit");
      if (rawLimit !== null) {
        if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1) {
          return jsonResponse(
            { error: `limit must be an integer from 1 to ${MAX_LIMIT}` },
            400,
          );
        }
        limit = Math.min(Number(rawLimit), MAX_LIMIT);
      }

      const requestedUserId = url.searchParams.get("user_id");
      if (requestedUserId && requestedUserId !== user.id) {
        if (!isUuid(requestedUserId)) {
          return jsonResponse({ error: "user_id must be a valid UUID" }, 400);
        }
        if (!isAdmin) {
          return jsonResponse({ error: "Forbidden" }, 403);
        }

        const { data, error } = await callerClient
          .from("coaching_notes")
          .select(ADMIN_COLUMNS)
          .eq("user_id", requestedUserId)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) {
          console.error("coaching-notes: select failed", error.code);
          return jsonResponse({ error: "Unable to load notes" }, 500);
        }
        return jsonResponse({ data: data ?? [] }, 200);
      }

      // Own notes: visible ones only (explicit filter in addition to RLS).
      const { data, error } = await callerClient
        .from("coaching_notes")
        .select(MEMBER_COLUMNS)
        .eq("user_id", user.id)
        .eq("visible_to_member", true)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        console.error("coaching-notes: select failed", error.code);
        return jsonResponse({ error: "Unable to load notes" }, 500);
      }
      return jsonResponse({ data: data ?? [] }, 200);
    }

    // ------------------------------------------- POST / PATCH / DELETE: admin
    if (!isAdmin) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // ----------------------------------------------------------------- POST
    if (req.method === "POST") {
      const body = await readJsonObject(req);
      if ("response" in body) return body.response;
      const record = body.record;

      for (const key of Object.keys(record)) {
        if (!ALLOWED_POST_KEYS.has(key)) {
          return jsonResponse({ error: `Unknown field: ${key}` }, 400);
        }
      }

      if (!isUuid(record.user_id)) {
        return jsonResponse(
          { error: "user_id is required and must be a valid UUID" },
          400,
        );
      }
      const targetId = record.user_id;

      const parsed = parseNote(record.note);
      if ("error" in parsed) {
        return jsonResponse({ error: parsed.error }, 400);
      }

      let visible = false;
      if (Object.prototype.hasOwnProperty.call(record, "visible_to_member")) {
        if (typeof record.visible_to_member !== "boolean") {
          return jsonResponse(
            { error: "visible_to_member must be a boolean" },
            400,
          );
        }
        visible = record.visible_to_member;
      }

      const { data: target, error: targetError } = await callerClient
        .from("profiles")
        .select("id")
        .eq("id", targetId)
        .eq("role", "member")
        .maybeSingle();

      if (targetError) {
        console.error("coaching-notes: target lookup failed", targetError.code);
        return jsonResponse({ error: "Unable to save note" }, 500);
      }
      if (!target) {
        return jsonResponse({ error: "Member not found" }, 404);
      }

      const { data, error } = await callerClient
        .from("coaching_notes")
        .insert({
          user_id: targetId,
          note: parsed.note,
          visible_to_member: visible,
        })
        .select(ADMIN_COLUMNS)
        .maybeSingle();

      if (error || !data) {
        console.error("coaching-notes: insert failed", error?.code);
        return jsonResponse({ error: "Unable to save note" }, 500);
      }
      return jsonResponse({ data }, 201);
    }

    // ---------------------------------------------------------------- PATCH
    if (req.method === "PATCH") {
      const id = url.searchParams.get("id");
      if (!isUuid(id)) {
        return jsonResponse({ error: "id must be a valid UUID" }, 400);
      }

      const body = await readJsonObject(req);
      if ("response" in body) return body.response;
      const record = body.record;

      for (const key of Object.keys(record)) {
        if (!ALLOWED_PATCH_KEYS.has(key)) {
          return jsonResponse({ error: `Unknown field: ${key}` }, 400);
        }
      }

      const patch: Record<string, unknown> = {};
      if (Object.prototype.hasOwnProperty.call(record, "note")) {
        const parsed = parseNote(record.note);
        if ("error" in parsed) {
          return jsonResponse({ error: parsed.error }, 400);
        }
        patch.note = parsed.note;
      }
      if (Object.prototype.hasOwnProperty.call(record, "visible_to_member")) {
        if (typeof record.visible_to_member !== "boolean") {
          return jsonResponse(
            { error: "visible_to_member must be a boolean" },
            400,
          );
        }
        patch.visible_to_member = record.visible_to_member;
      }
      if (Object.keys(patch).length === 0) {
        return jsonResponse(
          { error: "At least one of note or visible_to_member is required" },
          400,
        );
      }

      const { data, error } = await callerClient
        .from("coaching_notes")
        .update(patch)
        .eq("id", id)
        .select(ADMIN_COLUMNS)
        .maybeSingle();

      if (error) {
        console.error("coaching-notes: update failed", error.code);
        return jsonResponse({ error: "Unable to update note" }, 500);
      }
      if (!data) {
        return jsonResponse({ error: "Note not found" }, 404);
      }
      return jsonResponse({ data }, 200);
    }

    // --------------------------------------------------------------- DELETE
    const id = url.searchParams.get("id");
    if (!isUuid(id)) {
      return jsonResponse({ error: "id must be a valid UUID" }, 400);
    }

    const { data, error } = await callerClient
      .from("coaching_notes")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("coaching-notes: delete failed", error.code);
      return jsonResponse({ error: "Unable to delete note" }, 500);
    }
    if (!data) {
      return jsonResponse({ error: "Note not found" }, 404);
    }
    return jsonResponse({ data: { id: data.id } }, 200);
  } catch (err) {
    console.error(
      "coaching-notes: unexpected error",
      err instanceof Error ? err.name : "unknown",
    );
    return jsonResponse({ error: "Unable to process request" }, 500);
  }
});
