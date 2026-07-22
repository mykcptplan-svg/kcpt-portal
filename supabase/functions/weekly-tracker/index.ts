/**
 * weekly-tracker Edge Function
 *
 * GET/PUT for a member's weekly_tracker_entries row.
 *
 * Uses the caller's JWT only (no service_role). RLS policies still apply.
 * user_id is always derived server-side from the authenticated token —
 * never trusted from the request body, so a member cannot write another
 * member's row even if RLS were misconfigured.
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

/** Returns an error message if invalid, otherwise null. */
function validateHabits(habits: unknown): string | null {
  if (!Array.isArray(habits)) {
    return "habits must be an array";
  }

  for (let i = 0; i < habits.length; i++) {
    const item = habits[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return `habits[${i}] must be an object`;
    }

    const habit = item as Record<string, unknown>;

    if (typeof habit.name !== "string" || habit.name.trim().length < 1) {
      return `habits[${i}].name must be a non-empty string`;
    }

    if (
      !Array.isArray(habit.days) ||
      habit.days.length !== 7 ||
      !habit.days.every((d) => typeof d === "boolean")
    ) {
      return `habits[${i}].days must be an array of exactly 7 booleans`;
    }
  }

  return null;
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
    const weekStart = new URL(req.url).searchParams.get("week_start");
    if (!isValidWeekStart(weekStart)) {
      return jsonResponse(
        {
          error:
            "week_start query param is required and must be YYYY-MM-DD",
        },
        400,
      );
    }

    const { data, error: selectError } = await callerClient
      .from("weekly_tracker_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (selectError) {
      console.error("weekly-tracker: select failed", selectError);
      return jsonResponse({ error: "Unable to load tracker" }, 500);
    }

    return jsonResponse({ data: data ?? null }, 200);
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

  const habitsError = validateHabits(record.habits);
  if (habitsError) {
    return jsonResponse({ error: habitsError }, 400);
  }

  if (typeof record.sunday_reset_done !== "boolean") {
    return jsonResponse(
      { error: "sunday_reset_done must be a boolean" },
      400,
    );
  }

  const week_start = record.week_start;
  const habits = record.habits;
  const sunday_reset_done = record.sunday_reset_done;

  const { error: upsertError } = await callerClient
    .from("weekly_tracker_entries")
    .upsert(
      {
        user_id: user.id,
        week_start,
        habits,
        sunday_reset_done,
      },
      { onConflict: "user_id,week_start" },
    );

  if (upsertError) {
    console.error("weekly-tracker: upsert failed", upsertError);
    return jsonResponse({ error: "Unable to save tracker" }, 500);
  }

  return jsonResponse({ success: true }, 200);
});
