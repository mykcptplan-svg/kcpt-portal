/**
 * get-profile Edge Function
 *
 * Returns the authenticated caller's own profile display fields.
 *
 * Uses the caller's JWT only (no service_role). RLS policies still apply.
 * Identity is always derived server-side from the authenticated token —
 * never from the request body or query params.
 *
 * full_name comes from public.profiles; email and created_at come from
 * the auth user (profiles has no created_at column).
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
    console.error("get-profile: missing required environment configuration");
    return jsonResponse({ error: "Unable to load profile" }, 500);
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
    console.error("get-profile: invalid caller session", userError);
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: profile, error: selectError } = await callerClient
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    console.error("get-profile: profile select failed", selectError);
    return jsonResponse({ error: "Unable to load profile" }, 500);
  }

  return jsonResponse(
    {
      data: {
        full_name: profile?.full_name ?? "",
        email: user.email ?? null,
        created_at: user.created_at ?? null,
      },
    },
    200,
  );
});
