/**
 * complete-registration Edge Function
 *
 * After an invited member sets their password (frontend auth.updateUser),
 * the frontend calls this once to create their profiles row.
 *
 * Why this exists: AGENTS.md forbids the frontend from writing to Postgres
 * directly — even though profiles_insert_own RLS would allow a client insert.
 * All profile creation goes through this Edge Function.
 *
 * Deliberately does NOT use service_role. Inserts use the caller's JWT so
 * RLS (id = auth.uid(), role = 'member', status = 'active') still applies.
 * The only service_role exception in this project remains invite-member.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
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

  const fullName =
    body !== null &&
    typeof body === "object" &&
    "full_name" in body &&
    typeof (body as { full_name: unknown }).full_name === "string"
      ? (body as { full_name: string }).full_name.trim()
      : null;

  if (!fullName || fullName.length < 1) {
    return jsonResponse({ error: "full_name is required" }, 400);
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
      "complete-registration: missing required environment configuration",
    );
    return jsonResponse({ error: "Unable to complete registration" }, 500);
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
    console.error("complete-registration: invalid caller session", userError);
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: existing, error: selectError } = await callerClient
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    console.error("complete-registration: profile select failed", selectError);
    return jsonResponse({ error: "Unable to complete registration" }, 500);
  }

  if (existing) {
    return jsonResponse({ success: true }, 200);
  }

  const { error: insertError } = await callerClient.from("profiles").insert({
    id: user.id,
    full_name: fullName,
    role: "member",
    status: "active",
  });

  if (insertError) {
    // Unique violation (race with concurrent re-submit) — treat as success
    if (insertError.code === "23505") {
      return jsonResponse({ success: true }, 200);
    }
    console.error("complete-registration: profile insert failed", insertError);
    return jsonResponse({ error: "Unable to complete registration" }, 500);
  }

  return jsonResponse({ success: true }, 200);
});
