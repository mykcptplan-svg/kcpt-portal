/**
 * member-plan Edge Function
 *
 * GET [?user_id=<uuid>]
 *   - no user_id (or the caller's own id): the caller's own plan
 *   - another user's id: admin only (403 for everyone else, coaches included)
 *   Returns { data: MemberPlan | null }. Admin callers get user_id, the 14
 *   content fields, updated_at and updated_by. Non-admin callers get user_id
 *   and the 14 content fields only.
 *
 * PUT (admin only)
 *   Full replace of one member's plan. The body must contain user_id and all
 *   14 content keys (string or null). Unknown keys are rejected with 400.
 *   Values are trimmed; empty strings become null.
 *   The target profile must have role = 'member' (revoked members are
 *   allowed). A missing profile or a non-member profile returns 404.
 *
 * Caller JWT only (no service_role). RLS still applies.
 * updated_at / updated_by are set by a database trigger, never by this
 * function or the request body.
 *
 * Plan content is personal health information: request bodies and plan text
 * are never logged.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SHORT_FIELDS = [
  "name",
  "plan_calories",
  "plan_protein",
  "plan_steps",
  "plan_workouts",
  "plan_water",
] as const;

const LONG_FIELDS = [
  "goal",
  "food",
  "steps",
  "water",
  "workouts",
  "barriers",
  "check_in",
  "additional_guidance",
] as const;

const SHORT_MAX = 200;
const LONG_MAX = 8000;

const CONTENT_FIELDS: readonly string[] = [...SHORT_FIELDS, ...LONG_FIELDS];
const MEMBER_PLAN_COLUMNS = `user_id, ${CONTENT_FIELDS.join(", ")}`;
const ADMIN_PLAN_COLUMNS = `${MEMBER_PLAN_COLUMNS}, updated_at, updated_by`;
const ALLOWED_PUT_KEYS = new Set<string>(["user_id", ...CONTENT_FIELDS]);

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "PUT") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("member-plan: missing required environment configuration");
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
    console.error("member-plan: invalid caller session", userError);
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  // True only for an active admin: profiles RLS hides the row of a revoked
  // caller, and revoked admins also fail is_admin() on member_plans.
  async function callerIsAdmin(): Promise<boolean | "error"> {
    const { data: callerProfile, error: callerProfileError } =
      await callerClient
        .from("profiles")
        .select("role")
        .eq("id", user!.id)
        .maybeSingle();

    if (callerProfileError) {
      console.error("member-plan: caller profile lookup failed");
      return "error";
    }
    return callerProfile?.role === "admin";
  }

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const requestedUserId = url.searchParams.get("user_id");
      let subjectId = user.id;

      const isAdmin = await callerIsAdmin();
      if (isAdmin === "error") {
        return jsonResponse({ error: "Unable to load plan" }, 500);
      }

      if (requestedUserId && requestedUserId !== user.id) {
        if (!isUuid(requestedUserId)) {
          return jsonResponse({ error: "user_id must be a valid UUID" }, 400);
        }
        if (!isAdmin) {
          return jsonResponse({ error: "Forbidden" }, 403);
        }
        subjectId = requestedUserId;
      }

      const { data, error } = await callerClient
        .from("member_plans")
        .select(isAdmin ? ADMIN_PLAN_COLUMNS : MEMBER_PLAN_COLUMNS)
        .eq("user_id", subjectId)
        .maybeSingle();

      if (error) {
        console.error("member-plan: select failed", error.code);
        return jsonResponse({ error: "Unable to load plan" }, 500);
      }

      return jsonResponse({ data: data ?? null }, 200);
    }

    // PUT
    const isAdmin = await callerIsAdmin();
    if (isAdmin === "error") {
      return jsonResponse({ error: "Unable to save plan" }, 500);
    }
    if (!isAdmin) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    if (
      payload === null ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    ) {
      return jsonResponse({ error: "Body must be a JSON object" }, 400);
    }

    const record = payload as Record<string, unknown>;

    for (const key of Object.keys(record)) {
      if (!ALLOWED_PUT_KEYS.has(key)) {
        return jsonResponse({ error: `Unknown field: ${key}` }, 400);
      }
    }

    if (!isUuid(record.user_id)) {
      return jsonResponse({ error: "user_id must be a valid UUID" }, 400);
    }
    const targetId = record.user_id;

    const row: Record<string, string | null> = {};
    for (const field of CONTENT_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        return jsonResponse({ error: `Missing field: ${field}` }, 400);
      }
      const raw = record[field];
      if (raw !== null && typeof raw !== "string") {
        return jsonResponse(
          { error: `${field} must be a string or null` },
          400,
        );
      }
      const trimmed = raw === null ? "" : raw.trim();
      const max = (SHORT_FIELDS as readonly string[]).includes(field)
        ? SHORT_MAX
        : LONG_MAX;
      if (codePointLength(trimmed) > max) {
        return jsonResponse(
          { error: `${field} must be at most ${max} characters` },
          400,
        );
      }
      row[field] = trimmed.length > 0 ? trimmed : null;
    }

    const { data: target, error: targetError } = await callerClient
      .from("profiles")
      .select("id")
      .eq("id", targetId)
      .eq("role", "member")
      .maybeSingle();

    if (targetError) {
      console.error("member-plan: target lookup failed", targetError.code);
      return jsonResponse({ error: "Unable to save plan" }, 500);
    }
    if (!target) {
      return jsonResponse({ error: "Member not found" }, 404);
    }

    const { data, error: upsertError } = await callerClient
      .from("member_plans")
      .upsert({ user_id: targetId, ...row }, { onConflict: "user_id" })
      .select(ADMIN_PLAN_COLUMNS)
      .maybeSingle();

    if (upsertError) {
      console.error("member-plan: upsert failed", upsertError.code);
      return jsonResponse({ error: "Unable to save plan" }, 500);
    }
    if (!data) {
      return jsonResponse({ error: "Unable to save plan" }, 500);
    }

    return jsonResponse({ data }, 200);
  } catch (err) {
    console.error(
      "member-plan: unexpected error",
      err instanceof Error ? err.name : "unknown",
    );
    return jsonResponse({ error: "Unable to process request" }, 500);
  }
});
