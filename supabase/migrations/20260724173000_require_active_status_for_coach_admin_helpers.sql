-- Require profiles.status = 'active' for coach/admin privilege helpers.
-- Revoked coach/admin JWTs lose RLS coach/admin branches.
-- Active coaches still see revoked members' rows (target status unchanged).

create or replace function public.is_coach_or_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = uid
      and role in ('coach', 'admin')
      and status = 'active'
  );
$$;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = uid
      and role = 'admin'
      and status = 'active'
  );
$$;
