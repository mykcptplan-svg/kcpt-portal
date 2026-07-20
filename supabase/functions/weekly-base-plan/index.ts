/**
 * weekly-base-plan Edge Function
 *
 * GET/PUT for a member's weekly_base_plans row.
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

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
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
      "weekly-base-plan: missing required environment configuration",
    );
    return jsonResponse({ error: "Unable to process base plan request" }, 500);
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
    console.error("weekly-base-plan: invalid caller session", userError);
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
      .from("weekly_base_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (selectError) {
      console.error("weekly-base-plan: select failed", selectError);
      return jsonResponse({ error: "Unable to load base plan" }, 500);
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

  if (
    typeof record.nutrition_approach !== "string" ||
    record.nutrition_approach.trim().length < 1
  ) {
    return jsonResponse(
      { error: "nutrition_approach must be a non-empty string" },
      400,
    );
  }

  if (!isStringArray(record.breakfasts)) {
    return jsonResponse({ error: "breakfasts must be an array of strings" }, 400);
  }

  if (!isStringArray(record.lunches)) {
    return jsonResponse({ error: "lunches must be an array of strings" }, 400);
  }

  if (!isStringArray(record.trigger_snacks)) {
    return jsonResponse(
      { error: "trigger_snacks must be an array of strings" },
      400,
    );
  }

  if (!isStringArray(record.desserts)) {
    return jsonResponse({ error: "desserts must be an array of strings" }, 400);
  }

  if (!Array.isArray(record.evening_meals)) {
    return jsonResponse({ error: "evening_meals must be an array" }, 400);
  }

  const week_start = record.week_start;
  const nutrition_approach = record.nutrition_approach.trim();
  const breakfasts = record.breakfasts;
  const lunches = record.lunches;
  const trigger_snacks = record.trigger_snacks;
  const desserts = record.desserts;
  const evening_meals = record.evening_meals;

  const { error: upsertError } = await callerClient
    .from("weekly_base_plans")
    .upsert(
      {
        user_id: user.id,
        week_start,
        nutrition_approach,
        breakfasts,
        lunches,
        trigger_snacks,
        desserts,
        evening_meals,
      },
      { onConflict: "user_id,week_start" },
    );

  if (upsertError) {
    console.error("weekly-base-plan: upsert failed", upsertError);
    return jsonResponse({ error: "Unable to save base plan" }, 500);
  }

  return jsonResponse({ success: true }, 200);
});
