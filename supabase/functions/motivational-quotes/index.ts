/**
 * motivational-quotes Edge Function
 *
 * GET    — list quotes (RLS: members see active only; admin sees all)
 * POST   — create quote (admin)
 * PATCH  — update quote body / is_active (admin)
 * DELETE — delete quote (admin)
 *
 * Caller JWT only (no service_role). RLS still applies.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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

function bearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "motivational-quotes: missing required environment configuration",
    );
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const token = bearerToken(req);
  if (!token) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const authHeader = `Bearer ${token}`;
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser(token);

  if (userError || !user) {
    console.error("motivational-quotes: invalid caller session", userError);
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  async function requireAdmin(): Promise<Response | null> {
    const { data: callerProfile, error: callerProfileError } =
      await callerClient
        .from("profiles")
        .select("role")
        .eq("id", user!.id)
        .maybeSingle();

    if (
      callerProfileError ||
      !callerProfile ||
      callerProfile.role !== "admin"
    ) {
      console.error(
        "motivational-quotes: caller not admin",
        callerProfileError,
        callerProfile,
      );
      return jsonResponse({ error: "Forbidden" }, 403);
    }
    return null;
  }

  try {
    if (req.method === "GET") {
      const { data, error } = await callerClient
        .from("motivational_quotes")
        .select("id, body, is_active, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("motivational-quotes: list failed", error);
        return jsonResponse({ error: "Unable to load quotes" }, 500);
      }

      return jsonResponse({ data: data ?? [] }, 200);
    }

    if (req.method === "POST") {
      const forbidden = await requireAdmin();
      if (forbidden) return forbidden;

      let payload: unknown;
      try {
        payload = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const record = payload as Record<string, unknown>;
      const body =
        typeof record.body === "string" ? record.body.trim() : "";
      if (!body) {
        return jsonResponse({ error: "body is required" }, 400);
      }

      const isActive =
        typeof record.is_active === "boolean" ? record.is_active : true;

      const { data, error } = await callerClient
        .from("motivational_quotes")
        .insert({ body, is_active: isActive })
        .select("id, body, is_active, created_at")
        .single();

      if (error || !data) {
        console.error("motivational-quotes: insert failed", error);
        return jsonResponse({ error: "Unable to create quote" }, 500);
      }

      return jsonResponse({ data }, 201);
    }

    if (req.method === "PATCH") {
      const forbidden = await requireAdmin();
      if (forbidden) return forbidden;

      let payload: unknown;
      try {
        payload = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const record = payload as Record<string, unknown>;
      if (!isUuid(record.id)) {
        return jsonResponse({ error: "id must be a valid UUID" }, 400);
      }

      const hasBody = Object.prototype.hasOwnProperty.call(record, "body");
      const hasActive = Object.prototype.hasOwnProperty.call(
        record,
        "is_active",
      );

      if (!hasBody && !hasActive) {
        return jsonResponse(
          { error: "At least one of body or is_active must be provided" },
          400,
        );
      }

      const patch: Record<string, unknown> = {};
      if (hasBody) {
        const body =
          typeof record.body === "string" ? record.body.trim() : "";
        if (!body) {
          return jsonResponse({ error: "body must be non-empty" }, 400);
        }
        patch.body = body;
      }
      if (hasActive) {
        if (typeof record.is_active !== "boolean") {
          return jsonResponse({ error: "is_active must be a boolean" }, 400);
        }
        patch.is_active = record.is_active;
      }

      const { data, error } = await callerClient
        .from("motivational_quotes")
        .update(patch)
        .eq("id", record.id)
        .select("id, body, is_active, created_at")
        .maybeSingle();

      if (error) {
        console.error("motivational-quotes: update failed", error);
        return jsonResponse({ error: "Unable to update quote" }, 500);
      }
      if (!data) {
        return jsonResponse({ error: "Quote not found" }, 404);
      }

      return jsonResponse({ data }, 200);
    }

    if (req.method === "DELETE") {
      const forbidden = await requireAdmin();
      if (forbidden) return forbidden;

      let payload: unknown;
      try {
        payload = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const record = payload as Record<string, unknown>;
      if (!isUuid(record.id)) {
        return jsonResponse({ error: "id must be a valid UUID" }, 400);
      }

      const { data, error } = await callerClient
        .from("motivational_quotes")
        .delete()
        .eq("id", record.id)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("motivational-quotes: delete failed", error);
        return jsonResponse({ error: "Unable to delete quote" }, 500);
      }
      if (!data) {
        return jsonResponse({ error: "Quote not found" }, 404);
      }

      return jsonResponse({ data: { id: data.id } }, 200);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("motivational-quotes: unexpected error", err);
    return jsonResponse({ error: "Unable to process request" }, 500);
  }
});
