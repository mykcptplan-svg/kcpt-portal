-- Denormalize join time onto profiles so coach/admin member lists
-- need no service_role to read auth.users.created_at.
-- One-time backfill from auth.users: scripts/backfill_profiles_created_at.sql

alter table public.profiles
  add column created_at timestamptz not null default now();

comment on column public.profiles.created_at is
  'Denormalized join time (from auth.users at backfill / now() for new rows) so coach/admin lists need no service_role.';

create or replace function public.enforce_profiles_role_status_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only enforce for authenticated non-admins (auth.uid() null = privileged SQL / migrations).
  if auth.uid() is not null
  and (
       new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.coach_review_enabled is distinct from old.coach_review_enabled
    or new.created_at is distinct from old.created_at
  )
  and not public.is_admin(auth.uid()) then
    raise exception 'Only admins may change role, status, coach_review_enabled, or created_at on profiles';
  end if;

  return new;
end;
$$;
