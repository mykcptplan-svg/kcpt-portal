-- KCPT Portal — core schema and RLS
--
-- Follows AGENTS.md (repo root):
--   - Tables: profiles, weekly_base_plans, weekly_tracker_entries, weight_measurements
--   - Members: select/insert/update own rows (user_id = auth.uid() or profiles.id = auth.uid())
--   - Self-registration insert: role must be 'member' and status must be 'active'
--   - Coach/admin: read-only select across all tables via is_coach_or_admin(auth.uid())
--   - Admin only: may update any profiles row (status-only restriction enforced in Edge Functions)
--   - BEFORE UPDATE trigger on profiles blocks non-admins from changing role or status
--   - is_coach_or_admin / is_admin are SECURITY DEFINER to avoid RLS recursion on profiles
--   - JSON shapes: evening_meals = [{ day, meal, approach }], habits = [{ name, days[7] }]
--
-- Future migrations: keep RLS enabled, use the same helper functions, add explicit GRANTs.

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER — bypass RLS when reading profiles.role)
-- ---------------------------------------------------------------------------

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
  );
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'member' check (role in ('member', 'coach', 'admin')),
  status text not null default 'active' check (status in ('active', 'revoked'))
);

create table public.weekly_base_plans (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  nutrition_approach text not null,
  breakfasts text[] not null default '{}',
  lunches text[] not null default '{}',
  trigger_snacks text[] not null default '{}',
  desserts text[] not null default '{}',
  evening_meals jsonb not null default '[]',
  primary key (user_id, week_start)
);

comment on column public.weekly_base_plans.evening_meals is
  'Array of { day: string, meal: string, approach: "meal_bank" | "orange_base" | "own" }';

create table public.weekly_tracker_entries (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  habits jsonb not null default '[]',
  sunday_reset_done boolean not null default false,
  primary key (user_id, week_start)
);

comment on column public.weekly_tracker_entries.habits is
  'Array of { name: string, days: boolean[7] } — Mon through Sun';

create table public.weight_measurements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  weight numeric not null,
  waist numeric not null,
  hips numeric not null,
  chest numeric not null,
  primary key (user_id, week_start)
);

-- ---------------------------------------------------------------------------
-- Triggers (profiles privilege escalation guard)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_profiles_role_status_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and not public.is_admin(auth.uid()) then
    raise exception 'Only admins may change role or status on profiles';
  end if;

  return new;
end;
$$;

create trigger enforce_profiles_role_status_immutable
  before update on public.profiles
  for each row
  execute function public.enforce_profiles_role_status_immutable();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.weekly_base_plans enable row level security;
alter table public.weekly_tracker_entries enable row level security;
alter table public.weight_measurements enable row level security;

-- profiles ------------------------------------------------------------------

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_select_coach_or_admin"
  on public.profiles
  for select
  to authenticated
  using (public.is_coach_or_admin(auth.uid()));

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (
    id = auth.uid()
    and role = 'member'
    and status = 'active'
  );

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_update_admin"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- weekly_base_plans ---------------------------------------------------------

create policy "weekly_base_plans_select_own"
  on public.weekly_base_plans
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "weekly_base_plans_select_coach_or_admin"
  on public.weekly_base_plans
  for select
  to authenticated
  using (public.is_coach_or_admin(auth.uid()));

create policy "weekly_base_plans_insert_own"
  on public.weekly_base_plans
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "weekly_base_plans_update_own"
  on public.weekly_base_plans
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- weekly_tracker_entries ----------------------------------------------------

create policy "weekly_tracker_entries_select_own"
  on public.weekly_tracker_entries
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "weekly_tracker_entries_select_coach_or_admin"
  on public.weekly_tracker_entries
  for select
  to authenticated
  using (public.is_coach_or_admin(auth.uid()));

create policy "weekly_tracker_entries_insert_own"
  on public.weekly_tracker_entries
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "weekly_tracker_entries_update_own"
  on public.weekly_tracker_entries
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- weight_measurements -------------------------------------------------------

create policy "weight_measurements_select_own"
  on public.weight_measurements
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "weight_measurements_select_coach_or_admin"
  on public.weight_measurements
  for select
  to authenticated
  using (public.is_coach_or_admin(auth.uid()));

create policy "weight_measurements_insert_own"
  on public.weight_measurements
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "weight_measurements_update_own"
  on public.weight_measurements
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.weekly_base_plans to authenticated;
grant select, insert, update on public.weekly_tracker_entries to authenticated;
grant select, insert, update on public.weight_measurements to authenticated;

grant execute on function public.is_coach_or_admin(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
