/**
 * weekly-tracker Edge Function
 *
 * GET/PUT for a member's weekly_tracker_entries row.
 *
 * Uses the caller's JWT only (no service_role). RLS policies still apply.
 * PUT always writes user_id from the authenticated token. GET may pass an
 * optional user_id query param for coach/admin Coach Review reads; members
 * requesting another user's id receive 403.
 *
 * API field `non_negotiables` maps to the Postgres `habits` jsonb column
 * (no column rename / migration).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function isValidWeekStart(value: unknown): value is string {
  return typeof value === "string" && WEEK_START_PATTERN.test(value);
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Returns an error message if invalid, otherwise null. */
function validateNonNegotiables(value: unknown): string | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return "non_negotiables must be an array of exactly 3 strings";
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string") {
      return `non_negotiables[${i}] must be a string`;
    }
  }
  return null;
}

/** Coerce legacy habits objects or string[] into exactly 3 name strings. */
function coerceNonNegotiables(raw: unknown): string[] {
  const names = ["", "", ""];
  if (!Array.isArray(raw)) return names;
  for (let i = 0; i < 3; i++) {
    const item = raw[i];
    if (typeof item === "string") {
      names[i] = item;
    } else if (
      item !== null &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).name === "string"
    ) {
      names[i] = (item as Record<string, unknown>).name as string;
    }
  }
  return names;
}

const DAILY_METRIC_KEYS = [
  "calories",
  "protein",
  "water",
  "steps",
  "workout",
] as const;

const NUMERIC_CEILINGS: Record<"calories" | "protein" | "water" | "steps", number> =
  {
    calories: 10000,
    protein: 500,
    water: 20,
    steps: 100000,
  };

/** Returns an error message if invalid, otherwise null. */
function validateDailyMetrics(metrics: unknown): string | null {
  if (metrics === null || typeof metrics !== "object" || Array.isArray(metrics)) {
    return "daily_metrics must be an object";
  }

  const obj = metrics as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (
    keys.length !== DAILY_METRIC_KEYS.length ||
    !DAILY_METRIC_KEYS.every((key) => keys.includes(key))
  ) {
    return "daily_metrics must have exactly keys: calories, protein, water, steps, workout";
  }

  for (const key of DAILY_METRIC_KEYS) {
    const values = obj[key];
    if (!Array.isArray(values) || values.length !== 7) {
      return `daily_metrics.${key} must be an array of exactly 7 elements`;
    }

    for (let i = 0; i < values.length; i++) {
      const cell = values[i];
      if (cell === null) continue;

      if (key === "workout") {
        if (typeof cell !== "boolean") {
          return `daily_metrics.workout[${i}] must be null or a boolean`;
        }
        continue;
      }

      if (key === "calories" && cell === true) continue;

      const ceiling = NUMERIC_CEILINGS[key];
      if (
        typeof cell !== "number" ||
        !Number.isFinite(cell) ||
        cell < 0 ||
        cell > ceiling
      ) {
        return `daily_metrics.${key}[${i}] must be null${
          key === "calories" ? ", true," : ""
        } or a number between 0 and ${ceiling}`;
      }
    }
  }

  return null;
}

const RESET_TEXT_MAX = 2000;

/** Absent or null -> null. Present non-string or over-length -> error. */
function parseOptionalResetText(
  value: unknown,
  field: "went_well" | "adjust_next",
): { error: string } | { value: string | null } {
  if (value === undefined || value === null) {
    return { value: null };
  }
  if (typeof value !== "string") {
    return { error: `${field} must be a string` };
  }
  if (value.length > RESET_TEXT_MAX) {
    return { error: `${field} must be at most ${RESET_TEXT_MAX} characters` };
  }
  return { value };
}

function mapTrackerRow(
  row: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (row === null) return null;
  const { habits, ...rest } = row;
  return {
    ...rest,
    non_negotiables: coerceNonNegotiables(habits),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "PUT") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice("Bearer ".length);

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "weekly-tracker: missing required environment configuration",
    );
    return jsonResponse({ error: "Unable to process tracker request" }, 500);
  }

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser(token);

  if (userError || !user) {
    console.error("weekly-tracker: invalid caller session", userError);
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const weekStart = url.searchParams.get("week_start");
    if (!isValidWeekStart(weekStart)) {
      return jsonResponse(
        {
          error:
            "week_start query param is required and must be YYYY-MM-DD",
        },
        400,
      );
    }

    let subjectId = user.id;
    const requestedUserId = url.searchParams.get("user_id");
    if (requestedUserId && requestedUserId !== user.id) {
      if (!isUuid(requestedUserId)) {
        return jsonResponse({ error: "user_id must be a valid UUID" }, 400);
      }

      const { data: callerProfile, error: callerProfileError } =
        await callerClient
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

      if (
        callerProfileError ||
        !callerProfile ||
        (callerProfile.role !== "admin" && callerProfile.role !== "coach")
      ) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }

      subjectId = requestedUserId;
    }

    const { data, error: selectError } = await callerClient
      .from("weekly_tracker_entries")
      .select("*")
      .eq("user_id", subjectId)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (selectError) {
      console.error("weekly-tracker: select failed", selectError);
      return jsonResponse({ error: "Unable to load tracker" }, 500);
    }

    return jsonResponse(
      { data: mapTrackerRow(data as Record<string, unknown> | null) },
      200,
    );
  }

  // PUT
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (body === null || typeof body !== "object") {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const record = body as Record<string, unknown>;

  if (!isValidWeekStart(record.week_start)) {
    return jsonResponse(
      { error: "week_start is required and must be YYYY-MM-DD" },
      400,
    );
  }

  const nonNegotiablesError = validateNonNegotiables(record.non_negotiables);
  if (nonNegotiablesError) {
    return jsonResponse({ error: nonNegotiablesError }, 400);
  }

  const dailyMetricsError = validateDailyMetrics(record.daily_metrics);
  if (dailyMetricsError) {
    return jsonResponse({ error: dailyMetricsError }, 400);
  }

  if (typeof record.sunday_reset_done !== "boolean") {
    return jsonResponse(
      { error: "sunday_reset_done must be a boolean" },
      400,
    );
  }

  const wentWellParsed = parseOptionalResetText(record.went_well, "went_well");
  if ("error" in wentWellParsed) {
    return jsonResponse({ error: wentWellParsed.error }, 400);
  }

  const adjustNextParsed = parseOptionalResetText(
    record.adjust_next,
    "adjust_next",
  );
  if ("error" in adjustNextParsed) {
    return jsonResponse({ error: adjustNextParsed.error }, 400);
  }

  const week_start = record.week_start;
  const non_negotiables = record.non_negotiables;
  const daily_metrics = record.daily_metrics;
  const sunday_reset_done = record.sunday_reset_done;
  const went_well = wentWellParsed.value;
  const adjust_next = adjustNextParsed.value;

  const { error: upsertError } = await callerClient
    .from("weekly_tracker_entries")
    .upsert(
      {
        user_id: user.id,
        week_start,
        habits: non_negotiables,
        daily_metrics,
        sunday_reset_done,
        went_well,
        adjust_next,
      },
      { onConflict: "user_id,week_start" },
    );

  if (upsertError) {
    console.error("weekly-tracker: upsert failed", upsertError);
    return jsonResponse({ error: "Unable to save tracker" }, 500);
  }

  return jsonResponse({ success: true }, 200);
});
