/**
 * discard-next-week-draft Edge Function
 *
 * POST only. Deletes the caller's own weekly_base_plans and
 * weekly_tracker_entries rows for NEXT calendar week only.
 *
 * Uses the caller's JWT only (no service_role) — RLS's own-row DELETE
 * policies (added in migration 20260731110000) apply. The target
 * week_start is always computed server-side from the current date; any
 * week_start sent in the request body is ignored. This is deliberate:
 * it is the only thing standing between this endpoint and "delete any
 * week the caller wants", since RLS alone would allow a member to delete
 * their own current or past week rows too (RLS only checks user_id +
 * is_active(), not which week).
 *
 * Deleting a row that doesn't exist (e.g. draft already discarded, or
 * never created) is treated as success — this endpoint is idempotent.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

/** Same Monday-based week math as lib/week.ts, ported to Deno/server time. */
function formatWeekStart(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(date: Date = new Date()): string {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay(); // 0=Sun … 6=Sat
  const daysBackToMonday = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - daysBackToMonday);
  return formatWeekStart(result);
}

function getNextWeekStart(date: Date = new Date()): string {
  const currentMonday = getWeekStart(date);
  const [year, month, day] = currentMonday.split("-").map(Number);
  const next = new Date(year, month - 1, day + 7);
  return formatWeekStart(next);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
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
      "discard-next-week-draft: missing required environment configuration",
    );
    return jsonResponse({ error: "Unable to process request" }, 500);
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
    console.error("discard-next-week-draft: invalid caller session", userError);
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const nextWeekStart = getNextWeekStart();

  const { error: planDeleteError } = await callerClient
    .from("weekly_base_plans")
    .delete()
    .eq("user_id", user.id)
    .eq("week_start", nextWeekStart);

  if (planDeleteError) {
    console.error(
      "discard-next-week-draft: base plan delete failed",
      planDeleteError,
    );
    return jsonResponse({ error: "Unable to discard draft" }, 500);
  }

  const { error: trackerDeleteError } = await callerClient
    .from("weekly_tracker_entries")
    .delete()
    .eq("user_id", user.id)
    .eq("week_start", nextWeekStart);

  if (trackerDeleteError) {
    console.error(
      "discard-next-week-draft: tracker delete failed",
      trackerDeleteError,
    );
    return jsonResponse({ error: "Unable to discard draft" }, 500);
  }

  return jsonResponse({ success: true, week_start: nextWeekStart }, 200);
});
