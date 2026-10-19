-- KCPT Plan: one personalised plan per member.
-- Written by admin only. A member reads only their own row (active members only).
-- Coaches have NO access to this table (least privilege).

create table public.member_plans (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  name text,
  plan_calories text,
  plan_protein text,
  plan_steps text,
  plan_workouts text,
  plan_water text,
  goal text,
  food text,
  steps text,
  water text,
  workouts text,
  barriers text,
  check_in text,
  additional_guidance text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,

  constraint member_plans_short_max check (
    char_length(name) <= 200
    and char_length(plan_calories) <= 200
    and char_length(plan_protein) <= 200
    and char_length(plan_steps) <= 200
    and char_length(plan_workouts) <= 200
    and char_length(plan_water) <= 200
  ),
  constraint member_plans_long_max check (
    char_length(goal) <= 8000
    and char_length(food) <= 8000
    and char_length(steps) <= 8000
    and char_length(water) <= 8000
    and char_length(workouts) <= 8000
    and char_length(barriers) <= 8000
    and char_length(check_in) <= 8000
    and char_length(additional_guidance) <= 8000
  ),
  -- Empty strings are stored as NULL, never as ''.
  constraint member_plans_no_blank check (
    (name is null or btrim(name) <> '')
    and (plan_calories is null or btrim(plan_calories) <> '')
    and (plan_protein is null or btrim(plan_protein) <> '')
    and (plan_steps is null or btrim(plan_steps) <> '')
    and (plan_workouts is null or btrim(plan_workouts) <> '')
    and (plan_water is null or btrim(plan_water) <> '')
    and (goal is null or btrim(goal) <> '')
    and (food is null or btrim(food) <> '')
    and (steps is null or btrim(steps) <> '')
    and (water is null or btrim(water) <> '')
    and (workouts is null or btrim(workouts) <> '')
    and (barriers is null or btrim(barriers) <> '')
    and (check_in is null or btrim(check_in) <> '')
    and (additional_guidance is null or btrim(additional_guidance) <> '')
  )
);

comment on table public.member_plans is
  'KCPT Plan, one row per member. Admin-written. updated_at / updated_by are set by trigger.';

-- Audit columns come from the database (caller JWT), never from a request body.
-- auth.uid() is null for privileged SQL, so updated_by is nullable.
create or replace function public.member_plans_set_audit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- Trigger-only: never callable via RPC.
revoke execute on function public.member_plans_set_audit() from public;
revoke execute on function public.member_plans_set_audit() from anon;
revoke execute on function public.member_plans_set_audit() from authenticated;

create trigger member_plans_set_audit
  before insert or update on public.member_plans
  for each row
  execute function public.member_plans_set_audit();

alter table public.member_plans enable row level security;

-- Admin reads all; a member reads only their own row while active.
create policy "member_plans_select"
  on public.member_plans
  for select
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    or (
      user_id = (select auth.uid())
      and public.is_active((select auth.uid()))
    )
  );

create policy "member_plans_insert_admin"
  on public.member_plans
  for insert
  to authenticated
  with check (public.is_admin((select auth.uid())));

create policy "member_plans_update_admin"
  on public.member_plans
  for update
  to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- No delete policy. Strip default grants first (TRUNCATE is not covered by RLS).
revoke all on public.member_plans from anon;
revoke all on public.member_plans from authenticated;
grant select, insert, update on public.member_plans to authenticated;
