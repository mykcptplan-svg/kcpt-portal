# KCPT Portal — Project Rules

Keep this file up to date as decisions evolve. Any AI agent (Cursor, Claude, or otherwise) working in this repo should read this file first, before making any architectural or data-model decisions.

## Architecture

- Vercel hosts the frontend ONLY (Next.js UI). No backend logic, no API routes with business logic, no direct database calls from Vercel-hosted code.
- Supabase is the backend: all business logic lives in Supabase Edge Functions, and Postgres is the database.
- The frontend NEVER calls the Supabase database directly (no direct supabase-js table queries from client or server components). All reads and writes go through Supabase Edge Function endpoints, called via `fetch` from `lib/api/`.
- Edge Functions authenticate using a standard `Authorization: Bearer <token>` header, never cookies, so the exact same endpoints can be reused by a future native mobile app without modification.
- Row Level Security (RLS) stays enabled on all tables as a defense-in-depth layer, even though Edge Functions are the only entry point. Edge Functions should use the calling user's own auth context (their JWT) when querying Postgres, not the `service_role` key, so RLS policies still apply.
- The `service_role` key is not used anywhere in this project, with one deliberate, documented exception: the invite-only registration Edge Function calls `supabase.auth.admin.inviteUserByEmail()`, which requires `service_role`. This is the only place the key is used. It must live only in that Edge Function's server-side environment (Supabase, never Vercel) and must never be exposed to the frontend. No other Edge Function or code path should use `service_role`; everything else uses the caller's own JWT so RLS still applies. Any further use beyond this one exception must be flagged and discussed before being added.
- Session storage uses `@supabase/ssr` cookies (not localStorage), refreshed by root `middleware.ts` on matched requests — this enables server-side route protection. **Open risk:** Passion.io in-app webview cookie/session persistence is still untested on a real device.

## Data model

- Tables: `profiles`, `weekly_base_plans`, `weekly_tracker_entries`, `weight_measurements`.
- RLS policy pattern: members can only select/insert/update rows where `user_id = auth.uid()`. The coach/admin role (in `profiles.role`) can read all rows across all tables (read-only) for the Coach Review feature. Only `profiles.status` is writable by the admin role, never member content tables directly.
- `WeeklyTrackerEntry.habits` shape: `{ name: string; days: boolean[] }[]` (`days` = 7 flags, Mon–Sun).
- `WeeklyBasePlan.evening_meals` shape: `{ day: string; meal: string; approach: "meal_bank" | "orange_base" | "own" }[]` (one entry per day of the week).
- **Registration flow:** After invite + password setup, the new member’s `profiles` row is created by the `complete-registration` Edge Function (caller JWT + RLS), not by a direct supabase-js insert from the frontend — even though `profiles_insert_own` would allow it. Do not “simplify” this back to a client insert.

## Notes for PDF export (Milestone 3, not yet built)

- PDF generation must be Deno/edge-compatible (e.g. a library like `pdf-lib`), not Puppeteer or anything requiring a full Node.js/Chromium environment, since it will run inside a Supabase Edge Function.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
