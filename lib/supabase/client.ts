/**
 * Browser Supabase client — AUTH ONLY.
 *
 * Allowed: signInWithPassword, updateUser, getSession, onAuthStateChange, signOut
 * (and other auth.* methods used from client components).
 *
 * Forbidden: .from(...) table queries (or any direct database access).
 * All reads/writes go through Edge Functions via lib/api/ with
 * Authorization: Bearer <token>. See AGENTS.md.
 *
 * The only places that call .from(...) are Edge Functions
 * (invite-member, complete-registration) — never this client.
 *
 * Session is stored in cookies via @supabase/ssr (not localStorage).
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in .env.local (see .env.example).",
    );
  }
  return createBrowserClient(url, anonKey);
}
