-- Require profiles.status = 'active' on member own-row RLS policies.
-- Revoked members keep a valid Auth JWT, but lose Postgres access via RLS.
-- Coach/admin read-all policies are intentionally unchanged.

-- ---------------------------------------------------------------------------
-- Helper (SECURITY DEFINER — same pattern as is_admin / is_coach_or_admin)
-- ---------------------------------------------------------------------------

create or replace function public.is_active(uid uuid)
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
      and status = 'active'
  );
$$;

grant execute on function public.is_active(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- profiles (select/update own only — insert stays as-is for new members)
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() and public.is_active(auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() and public.is_active(auth.uid()))
  with check (id = auth.uid() and public.is_active(auth.uid()));

-- ---------------------------------------------------------------------------
-- weekly_base_plans
-- ---------------------------------------------------------------------------

drop policy if exists "weekly_base_plans_select_own" on public.weekly_base_plans;
create policy "weekly_base_plans_select_own"
  on public.weekly_base_plans
  for select
  to authenticated
  using (user_id = auth.uid() and public.is_active(auth.uid()));

drop policy if exists "weekly_base_plans_insert_own" on public.weekly_base_plans;
create policy "weekly_base_plans_insert_own"
  on public.weekly_base_plans
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_active(auth.uid()));

drop policy if exists "weekly_base_plans_update_own" on public.weekly_base_plans;
create policy "weekly_base_plans_update_own"
  on public.weekly_base_plans
  for update
  to authenticated
  using (user_id = auth.uid() and public.is_active(auth.uid()))
  with check (user_id = auth.uid() and public.is_active(auth.uid()));

-- ---------------------------------------------------------------------------
-- weekly_tracker_entries
-- ---------------------------------------------------------------------------

drop policy if exists "weekly_tracker_entries_select_own" on public.weekly_tracker_entries;
create policy "weekly_tracker_entries_select_own"
  on public.weekly_tracker_entries
  for select
  to authenticated
  using (user_id = auth.uid() and public.is_active(auth.uid()));

drop policy if exists "weekly_tracker_entries_insert_own" on public.weekly_tracker_entries;
create policy "weekly_tracker_entries_insert_own"
  on public.weekly_tracker_entries
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_active(auth.uid()));

drop policy if exists "weekly_tracker_entries_update_own" on public.weekly_tracker_entries;
create policy "weekly_tracker_entries_update_own"
  on public.weekly_tracker_entries
  for update
  to authenticated
  using (user_id = auth.uid() and public.is_active(auth.uid()))
  with check (user_id = auth.uid() and public.is_active(auth.uid()));

-- ---------------------------------------------------------------------------
-- weight_measurements
-- ---------------------------------------------------------------------------

drop policy if exists "weight_measurements_select_own" on public.weight_measurements;
create policy "weight_measurements_select_own"
  on public.weight_measurements
  for select
  to authenticated
  using (user_id = auth.uid() and public.is_active(auth.uid()));

drop policy if exists "weight_measurements_insert_own" on public.weight_measurements;
create policy "weight_measurements_insert_own"
  on public.weight_measurements
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_active(auth.uid()));

drop policy if exists "weight_measurements_update_own" on public.weight_measurements;
create policy "weight_measurements_update_own"
  on public.weight_measurements
  for update
  to authenticated
  using (user_id = auth.uid() and public.is_active(auth.uid()))
  with check (user_id = auth.uid() and public.is_active(auth.uid()));
