/**
 * members-list Edge Function
 *
 * Returns member profiles for Admin Panel / Coach Review.
 *
 * Uses the caller's JWT only (no service_role). Email is denormalized on
 * profiles so auth.users is never queried. Coach/admin RLS select already
 * allows reading all profiles; coaches are filtered in-app to
 * coach_review_enabled === true before the response is returned.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

type MemberRow = {
  id: string;
  full_name: string;
  email: string | null;
  status: string;
  coach_review_enabled: boolean;
  role: string;
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
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const token = authHeader.slice("Bearer ".length);

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("members-list: missing required environment configuration");
    return jsonResponse({ error: "Unable to load members" }, 500);
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
    console.error("members-list: invalid caller session", userError);
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const { data: callerProfile, error: callerProfileError } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (
    callerProfileError ||
    !callerProfile ||
    (callerProfile.role !== "admin" && callerProfile.role !== "coach")
  ) {
    console.error(
      "members-list: caller not coach or admin",
      callerProfileError,
      callerProfile,
    );
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const { data: rows, error: selectError } = await callerClient
    .from("profiles")
    .select("id, full_name, email, status, coach_review_enabled, role")
    .eq("role", "member")
    .order("full_name", { ascending: true });

  if (selectError) {
    console.error("members-list: select failed", selectError);
    return jsonResponse({ error: "Unable to load members" }, 500);
  }

  let members = ((rows ?? []) as MemberRow[]).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    status: row.status,
    coach_review_enabled: row.coach_review_enabled,
    role: "member" as const,
  }));

  if (callerProfile.role === "coach") {
    members = members.filter((m) => m.coach_review_enabled === true);
  }

  return jsonResponse({ data: members }, 200);
});
