-- Add coach_review_enabled and extend the profiles privilege-escalation trigger
-- so only admins may change role, status, or coach_review_enabled.

alter table public.profiles
  add column coach_review_enabled boolean not null default false;

comment on column public.profiles.coach_review_enabled is
  'When true, this member appears in Coach Review. Writable by admin only.';

create or replace function public.enforce_profiles_role_status_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
       new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.coach_review_enabled is distinct from old.coach_review_enabled
  )
  and not public.is_admin(auth.uid()) then
    raise exception 'Only admins may change role, status, or coach_review_enabled on profiles';
  end if;

  return new;
end;
$$;
