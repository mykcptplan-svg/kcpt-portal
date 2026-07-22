/**
 * weight-measurements Edge Function
 *
 * GET/PUT for a member's weight_measurements row.
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
function validatePositiveNumber(
  value: unknown,
  fieldName: string,
): string | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return `${fieldName} must be a positive number`;
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
      "weight-measurements: missing required environment configuration",
    );
    return jsonResponse(
      { error: "Unable to process measurements request" },
      500,
    );
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
    console.error("weight-measurements: invalid caller session", userError);
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
      .from("weight_measurements")
      .select("*")
      .eq("user_id", user.id)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (selectError) {
      console.error("weight-measurements: select failed", selectError);
      return jsonResponse({ error: "Unable to load measurements" }, 500);
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

  for (const field of ["weight", "waist", "hips", "chest"] as const) {
    const fieldError = validatePositiveNumber(record[field], field);
    if (fieldError) {
      return jsonResponse({ error: fieldError }, 400);
    }
  }

  const week_start = record.week_start;
  const weight = record.weight as number;
  const waist = record.waist as number;
  const hips = record.hips as number;
  const chest = record.chest as number;

  const { error: upsertError } = await callerClient
    .from("weight_measurements")
    .upsert(
      {
        user_id: user.id,
        week_start,
        weight,
        waist,
        hips,
        chest,
      },
      { onConflict: "user_id,week_start" },
    );

  if (upsertError) {
    console.error("weight-measurements: upsert failed", upsertError);
    return jsonResponse({ error: "Unable to save measurements" }, 500);
  }

  return jsonResponse({ success: true }, 200);
});
