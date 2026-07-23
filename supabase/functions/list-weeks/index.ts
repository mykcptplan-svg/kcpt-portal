/**
 * list-weeks Edge Function
 *
 * GET distinct week_start values across weekly_base_plans,
 * weekly_tracker_entries, and weight_measurements for a subject user,
 * with per-table presence flags.
 *
 * Uses the caller's JWT only (no service_role). RLS policies still apply.
 * Optional user_id query param allows coach/admin Coach Review / History
 * reads of another member; members requesting another user's id receive 403.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type WeekFlags = {
  has_base_plan: boolean;
  has_tracker: boolean;
  has_measurements: boolean;
};

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

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function emptyFlags(): WeekFlags {
  return {
    has_base_plan: false,
    has_tracker: false,
    has_measurements: false,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
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
    console.error("list-weeks: missing required environment configuration");
    return jsonResponse({ error: "Unable to load weeks" }, 500);
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
    console.error("list-weeks: invalid caller session", userError);
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
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

  const [basePlanResult, trackerResult, measurementsResult] = await Promise.all(
    [
      callerClient
        .from("weekly_base_plans")
        .select("week_start")
        .eq("user_id", subjectId),
      callerClient
        .from("weekly_tracker_entries")
        .select("week_start")
        .eq("user_id", subjectId),
      callerClient
        .from("weight_measurements")
        .select("week_start")
        .eq("user_id", subjectId),
    ],
  );

  if (basePlanResult.error) {
    console.error("list-weeks: base plan select failed", basePlanResult.error);
    return jsonResponse({ error: "Unable to load weeks" }, 500);
  }
  if (trackerResult.error) {
    console.error("list-weeks: tracker select failed", trackerResult.error);
    return jsonResponse({ error: "Unable to load weeks" }, 500);
  }
  if (measurementsResult.error) {
    console.error(
      "list-weeks: measurements select failed",
      measurementsResult.error,
    );
    return jsonResponse({ error: "Unable to load weeks" }, 500);
  }

  const byWeek = new Map<string, WeekFlags>();

  for (const row of basePlanResult.data ?? []) {
    const weekStart = row.week_start as string;
    const flags = byWeek.get(weekStart) ?? emptyFlags();
    flags.has_base_plan = true;
    byWeek.set(weekStart, flags);
  }

  for (const row of trackerResult.data ?? []) {
    const weekStart = row.week_start as string;
    const flags = byWeek.get(weekStart) ?? emptyFlags();
    flags.has_tracker = true;
    byWeek.set(weekStart, flags);
  }

  for (const row of measurementsResult.data ?? []) {
    const weekStart = row.week_start as string;
    const flags = byWeek.get(weekStart) ?? emptyFlags();
    flags.has_measurements = true;
    byWeek.set(weekStart, flags);
  }

  const data = Array.from(byWeek.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([week_start, flags]) => ({
      week_start,
      ...flags,
    }));

  return jsonResponse({ data }, 200);
});
