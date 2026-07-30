-- One-time backfill: run AFTER migration 20260730120000_profiles_created_at.
-- Order: 1) apply migration  2) run this script once.
--
-- Run in Supabase SQL Editor / MCP as a privileged role (can read auth.users).
-- Not an Edge Function. Do not ship service_role into the app for this.

update public.profiles p
set created_at = u.created_at
from auth.users u
where p.id = u.id
  and u.created_at is not null;
