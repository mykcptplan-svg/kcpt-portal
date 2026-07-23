/**
 * admin-manage-member Edge Function
 *
 * Admin-only updates to a member's profiles.status and/or
 * profiles.coach_review_enabled.
 *
 * Uses the caller's JWT only (no service_role). RLS profiles_update admin
 * branch + the enforce_profiles_role_status_immutable trigger still apply.
 * Target identity always comes from the request body user_id, but the
 * caller must be an admin; coaches cannot use this endpoint.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const token = authHeader.slice("Bearer ".length);

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "admin-manage-member: missing required environment configuration",
    );
    return jsonResponse({ error: "Unable to update member" }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const record = body as Record<string, unknown>;

  if (!isUuid(record.user_id)) {
    return jsonResponse({ error: "user_id must be a valid UUID" }, 400);
  }

  const hasStatus = Object.prototype.hasOwnProperty.call(record, "status");
  const hasCoachReview = Object.prototype.hasOwnProperty.call(
    record,
    "coach_review_enabled",
  );

  if (!hasStatus && !hasCoachReview) {
    return jsonResponse(
      {
        error:
          "At least one of status or coach_review_enabled must be provided",
      },
      400,
    );
  }

  if (
    hasStatus &&
    record.status !== "active" &&
    record.status !== "revoked"
  ) {
    return jsonResponse(
      { error: 'status must be "active" or "revoked"' },
      400,
    );
  }

  if (hasCoachReview && typeof record.coach_review_enabled !== "boolean") {
    return jsonResponse(
      { error: "coach_review_enabled must be a boolean" },
      400,
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
    console.error("admin-manage-member: invalid caller session", userError);
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const { data: callerProfile, error: callerProfileError } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (callerProfileError || !callerProfile || callerProfile.role !== "admin") {
    console.error(
      "admin-manage-member: caller not admin",
      callerProfileError,
      callerProfile,
    );
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const { data: target, error: targetError } = await callerClient
    .from("profiles")
    .select("id, role")
    .eq("id", record.user_id)
    .maybeSingle();

  if (targetError) {
    console.error("admin-manage-member: target select failed", targetError);
    return jsonResponse({ error: "Unable to update member" }, 500);
  }

  if (!target) {
    return jsonResponse({ error: "Member not found" }, 404);
  }

  if (target.role !== "member") {
    return jsonResponse(
      { error: "Only member profiles can be managed" },
      400,
    );
  }

  const patch: Record<string, unknown> = {};
  if (hasStatus) patch.status = record.status;
  if (hasCoachReview) patch.coach_review_enabled = record.coach_review_enabled;

  const { error: updateError } = await callerClient
    .from("profiles")
    .update(patch)
    .eq("id", record.user_id)
    .eq("role", "member");

  if (updateError) {
    console.error("admin-manage-member: update failed", updateError);
    return jsonResponse({ error: "Unable to update member" }, 500);
  }

  return jsonResponse({ success: true }, 200);
});
