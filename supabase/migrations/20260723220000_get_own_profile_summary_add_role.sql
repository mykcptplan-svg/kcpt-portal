-- Extend get_own_profile_summary to also return role.
-- Must DROP first: CREATE OR REPLACE cannot change RETURNS TABLE shape.

drop function if exists public.get_own_profile_summary(uuid);

create function public.get_own_profile_summary(uid uuid)
returns table (full_name text, status text, role text)
language sql
security definer
set search_path = public
stable
as $$
  select full_name, status, role
  from public.profiles
  where id = uid
    and uid = auth.uid();
$$;

-- Grants do not survive DROP; restore post-advisor posture
revoke execute on function public.get_own_profile_summary(uuid) from public;
revoke execute on function public.get_own_profile_summary(uuid) from anon;
grant execute on function public.get_own_profile_summary(uuid) to authenticated;
