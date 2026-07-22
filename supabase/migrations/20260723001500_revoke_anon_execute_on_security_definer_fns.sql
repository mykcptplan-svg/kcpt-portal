-- Tighten EXECUTE on SECURITY DEFINER helpers flagged by Security Advisor.
-- Postgres defaults grant EXECUTE to PUBLIC (includes anon); strip that.
-- Trigger function must not be callable via RPC at all.
-- Helpers keep EXECUTE for authenticated (RLS + get-profile).

-- Trigger-only: never callable via RPC
revoke execute on function public.enforce_profiles_role_status_immutable() from public;
revoke execute on function public.enforce_profiles_role_status_immutable() from anon;
revoke execute on function public.enforce_profiles_role_status_immutable() from authenticated;

-- Helpers used by RLS / get-profile: drop PUBLIC/anon, keep authenticated
revoke execute on function public.is_admin(uuid) from public;
revoke execute on function public.is_admin(uuid) from anon;
grant execute on function public.is_admin(uuid) to authenticated;

revoke execute on function public.is_coach_or_admin(uuid) from public;
revoke execute on function public.is_coach_or_admin(uuid) from anon;
grant execute on function public.is_coach_or_admin(uuid) to authenticated;

revoke execute on function public.is_active(uuid) from public;
revoke execute on function public.is_active(uuid) from anon;
grant execute on function public.is_active(uuid) to authenticated;

revoke execute on function public.get_own_profile_summary(uuid) from public;
revoke execute on function public.get_own_profile_summary(uuid) from anon;
grant execute on function public.get_own_profile_summary(uuid) to authenticated;
