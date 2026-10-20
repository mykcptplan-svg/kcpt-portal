/**
 * member-focus Edge Function
 *
 * Focus This Week: dated focus points per member. The focus in force for a
 * week W is the row with the greatest effective_week <= W.
 *
 * GET ?week_start=YYYY-MM-DD[&user_id=<uuid>]
 *   Returns { resolved, history }.
 *   - resolved: { effective_week, items, source, updated_at, updated_by } for
 *     the row in force at week_start, or null.
 *   - history: the 8 most recent rows, newest effective_week first.
 *   Without user_id (or with the caller's own id) the caller's own rows are
 *   returned. Another user's id is coach or admin only (403 for members).
 *
 * PUT { effective_week, items, user_id? }
 *   - member: writes only their own row. effective_week must be this week's or
 *     next week's Monday. At most 3 items.
 *   - admin: user_id is required and must belong to a member. Any Monday.
 *     At most 5 items.
 *   - everyone else (coach, revoked): 403. Coaches are read-only.
 *   Items are trimmed, non-empty strings of at most 120 characters.
 *   Upserts on (user_id, effective_week). source is derived from the caller's
 *   role here and again by a database trigger; the body cannot set it.
 *
 * Caller JWT only (no service_role). RLS still applies.
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
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ITEM_MAX_CHARS = 120;
const MEMBER_MAX_ITEMS = 3;
const ADMIN_MAX_ITEMS = 5;
const HISTORY_LIMIT = 8;

// Keep in sync with member_focus_current_monday() in the migration.
const HOME_TIME_ZONE = "Europe/London";

const FOCUS_COLUMNS = "user_id, effective_week, items, source, updated_at, updated_by";

const ALLOWED_PUT_KEYS = new Set(["effective_week", "items", "user_id"]);

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

/** Real calendar date in YYYY-MM-DD form. */
function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** Real calendar date that falls on a Monday. */
function isMonday(value: unknown): value is string {
  if (!isValidDate(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const out = new Date(Date.UTC(y, m - 1, d + days));
  return out.toISOString().slice(0, 10);
}

/** Monday of the current week in HOME_TIME_ZONE, as YYYY-MM-DD. */
function currentMonday(): string {
  // en-CA formats as YYYY-MM-DD.
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: HOME_TIME_ZONE,
  });
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(today, -back);
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
    console.error("member-focus: missing required environment configuration");
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
    console.error("member-focus: invalid caller session", userError);
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  // The caller's role, or null when their own profile row is hidden by RLS
  // (revoked members). Null is never allowed to write.
  async function callerRole(): Promise<string | null | "error"> {
    const { data, error } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", user!.id)
      .maybeSingle();
    if (error) {
      console.error("member-focus: caller profile lookup failed");
      return "error";
    }
    return typeof data?.role === "string" ? data.role : null;
  }

  try {
    const role = await callerRole();
    if (role === "error") {
      return jsonResponse({ error: "Unable to process request" }, 500);
    }
    const isAdmin = role === "admin";
    const isCoachOrAdmin = role === "admin" || role === "coach";

    // ------------------------------------------------------------------ GET
    if (req.method === "GET") {
      const url = new URL(req.url);
      const weekStart = url.searchParams.get("week_start");
      if (!isMonday(weekStart)) {
        return jsonResponse(
          { error: "week_start is required and must be a Monday (YYYY-MM-DD)" },
          400,
        );
      }

      const requestedUserId = url.searchParams.get("user_id");
      let subjectId = user.id;
      if (requestedUserId && requestedUserId !== user.id) {
        if (!isUuid(requestedUserId)) {
          return jsonResponse({ error: "user_id must be a valid UUID" }, 400);
        }
        if (!isCoachOrAdmin) {
          return jsonResponse({ error: "Forbidden" }, 403);
        }
        subjectId = requestedUserId;
      }

      const [resolvedRes, historyRes] = await Promise.all([
        callerClient
          .from("member_focus")
          .select(FOCUS_COLUMNS)
          .eq("user_id", subjectId)
          .lte("effective_week", weekStart)
          .order("effective_week", { ascending: false })
          .limit(1)
          .maybeSingle(),
        callerClient
          .from("member_focus")
          .select(FOCUS_COLUMNS)
          .eq("user_id", subjectId)
          .order("effective_week", { ascending: false })
          .limit(HISTORY_LIMIT),
      ]);

      if (resolvedRes.error || historyRes.error) {
        console.error(
          "member-focus: select failed",
          resolvedRes.error?.code ?? historyRes.error?.code,
        );
        return jsonResponse({ error: "Unable to load focus" }, 500);
      }

      return jsonResponse(
        {
          resolved: resolvedRes.data ?? null,
          history: historyRes.data ?? [],
        },
        200,
      );
    }

    // ------------------------------------------------------------------ PUT
    if (role !== "admin" && role !== "member") {
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

    // Target user.
    let targetId: string;
    if (isAdmin) {
      if (!isUuid(record.user_id)) {
        return jsonResponse(
          { error: "user_id is required and must be a valid UUID" },
          400,
        );
      }
      targetId = record.user_id;
    } else {
      if (
        Object.prototype.hasOwnProperty.call(record, "user_id") &&
        record.user_id !== user.id
      ) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
      targetId = user.id;
    }

    // Week.
    if (!isMonday(record.effective_week)) {
      return jsonResponse(
        { error: "effective_week is required and must be a Monday (YYYY-MM-DD)" },
        400,
      );
    }
    const effectiveWeek = record.effective_week;
    if (!isAdmin) {
      const monday = currentMonday();
      if (effectiveWeek !== monday && effectiveWeek !== addDays(monday, 7)) {
        return jsonResponse(
          {
            error:
              "effective_week must be this week's Monday or next week's Monday",
          },
          400,
        );
      }
    }

    // Items.
    if (!Array.isArray(record.items)) {
      return jsonResponse({ error: "items must be an array of strings" }, 400);
    }
    const maxItems = isAdmin ? ADMIN_MAX_ITEMS : MEMBER_MAX_ITEMS;
    if (record.items.length > maxItems) {
      return jsonResponse(
        { error: `items must contain at most ${maxItems} points` },
        400,
      );
    }
    const items: string[] = [];
    for (let i = 0; i < record.items.length; i++) {
      const raw = record.items[i];
      if (typeof raw !== "string") {
        return jsonResponse({ error: `items[${i}] must be a string` }, 400);
      }
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        return jsonResponse({ error: `items[${i}] must not be empty` }, 400);
      }
      if (codePointLength(trimmed) > ITEM_MAX_CHARS) {
        return jsonResponse(
          { error: `items[${i}] must be at most ${ITEM_MAX_CHARS} characters` },
          400,
        );
      }
      items.push(trimmed);
    }

    // An admin may only write to member profiles.
    if (isAdmin) {
      const { data: target, error: targetError } = await callerClient
        .from("profiles")
        .select("id")
        .eq("id", targetId)
        .eq("role", "member")
        .maybeSingle();
      if (targetError) {
        console.error("member-focus: target lookup failed", targetError.code);
        return jsonResponse({ error: "Unable to save focus" }, 500);
      }
      if (!target) {
        return jsonResponse({ error: "Member not found" }, 404);
      }
    }

    const { data, error: upsertError } = await callerClient
      .from("member_focus")
      .upsert(
        {
          user_id: targetId,
          effective_week: effectiveWeek,
          items,
          source: isAdmin ? "admin" : "member",
          updated_by: user.id,
        },
        { onConflict: "user_id,effective_week" },
      )
      .select(FOCUS_COLUMNS)
      .maybeSingle();

    if (upsertError) {
      console.error("member-focus: upsert failed", upsertError.code);
      return jsonResponse({ error: "Unable to save focus" }, 500);
    }
    if (!data) {
      return jsonResponse({ error: "Unable to save focus" }, 500);
    }

    return jsonResponse({ data }, 200);
  } catch (err) {
    console.error(
      "member-focus: unexpected error",
      err instanceof Error ? err.name : "unknown",
    );
    return jsonResponse({ error: "Unable to process request" }, 500);
  }
});
