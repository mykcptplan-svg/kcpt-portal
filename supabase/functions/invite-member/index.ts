/**
 * invite-member Edge Function
 *
 * This is the ONE place in the KCPT Portal project allowed to use the
 * service_role key (see AGENTS.md). inviteUserByEmail() requires admin auth
 * APIs that only service_role can call.
 *
 * Flow:
 *   1. Authorize the CALLING user via their Bearer JWT (the admin/coach
 *      doing the invite) — anon key + caller token, RLS on profiles.
 *   2. Only after role check passes, use a separate service_role client
 *      to send the invite email. The service_role key never appears in responses.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPlausibleEmail(value: unknown): value is string {
  return typeof value === "string" && EMAIL_PATTERN.test(value.trim());
}

function requiredEnv(name: string): string | null {
  const value = Deno.env.get(name);
  return value && value.length > 0 ? value : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const email =
    body !== null &&
    typeof body === "object" &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email.trim()
      : null;

  if (!email || !isPlausibleEmail(email)) {
    return jsonResponse({ error: "A valid email address is required" }, 400);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const token = authHeader.slice("Bearer ".length);

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const redirectTo = requiredEnv("INVITE_SET_PASSWORD_REDIRECT_URL");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !redirectTo) {
    console.error("invite-member: missing required environment configuration");
    return jsonResponse({ error: "Unable to send invite" }, 500);
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
    console.error("invite-member: invalid caller session", userError);
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const { data: profile, error: profileError } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    (profile.role !== "admin" && profile.role !== "coach")
  ) {
    console.error("invite-member: caller not authorized", profileError, profile);
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    { redirectTo },
  );

  if (inviteError) {
    console.error("invite-member: inviteUserByEmail failed", inviteError);
    return jsonResponse({ error: "Unable to send invite" }, 500);
  }

  return jsonResponse({ success: true, email }, 200);
});
