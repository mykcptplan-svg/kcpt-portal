-- Narrow SECURITY DEFINER read of the caller's own full_name + status.
-- Needed so revoked members can still learn their status via get-profile
-- after own-row RLS requires is_active().

create or replace function public.get_own_profile_summary(uid uuid)
returns table (full_name text, status text)
language sql
security definer
set search_path = public
stable
as $$
  select full_name, status
  from public.profiles
  where id = uid
    and uid = auth.uid();
$$;

grant execute on function public.get_own_profile_summary(uuid) to authenticated;
