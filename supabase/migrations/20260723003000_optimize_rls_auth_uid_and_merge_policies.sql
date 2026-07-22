-- Optimize RLS: wrap auth.uid() in (select auth.uid()) for initplan,
-- and merge duplicate permissive policies while keeping is_active()
-- only on the own-row OR-branch (coaches still see revoked members).

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_coach_or_admin" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles
  for select
  to authenticated
  using (
    public.is_coach_or_admin((select auth.uid()))
    or (
      id = (select auth.uid())
      and public.is_active((select auth.uid()))
    )
  );

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (
    id = (select auth.uid())
    and role = 'member'
    and status = 'active'
  );

drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update"
  on public.profiles
  for update
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    or (
      id = (select auth.uid())
      and public.is_active((select auth.uid()))
    )
  )
  with check (
    public.is_admin((select auth.uid()))
    or (
      id = (select auth.uid())
      and public.is_active((select auth.uid()))
    )
  );

-- ---------------------------------------------------------------------------
-- weekly_base_plans
-- ---------------------------------------------------------------------------

drop policy if exists "weekly_base_plans_select_own" on public.weekly_base_plans;
drop policy if exists "weekly_base_plans_select_coach_or_admin" on public.weekly_base_plans;
drop policy if exists "weekly_base_plans_select" on public.weekly_base_plans;
create policy "weekly_base_plans_select"
  on public.weekly_base_plans
  for select
  to authenticated
  using (
    public.is_coach_or_admin((select auth.uid()))
    or (
      user_id = (select auth.uid())
      and public.is_active((select auth.uid()))
    )
  );

drop policy if exists "weekly_base_plans_insert_own" on public.weekly_base_plans;
create policy "weekly_base_plans_insert_own"
  on public.weekly_base_plans
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active((select auth.uid()))
  );

drop policy if exists "weekly_base_plans_update_own" on public.weekly_base_plans;
create policy "weekly_base_plans_update_own"
  on public.weekly_base_plans
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_active((select auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    and public.is_active((select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- weekly_tracker_entries
-- ---------------------------------------------------------------------------

drop policy if exists "weekly_tracker_entries_select_own" on public.weekly_tracker_entries;
drop policy if exists "weekly_tracker_entries_select_coach_or_admin" on public.weekly_tracker_entries;
drop policy if exists "weekly_tracker_entries_select" on public.weekly_tracker_entries;
create policy "weekly_tracker_entries_select"
  on public.weekly_tracker_entries
  for select
  to authenticated
  using (
    public.is_coach_or_admin((select auth.uid()))
    or (
      user_id = (select auth.uid())
      and public.is_active((select auth.uid()))
    )
  );

drop policy if exists "weekly_tracker_entries_insert_own" on public.weekly_tracker_entries;
create policy "weekly_tracker_entries_insert_own"
  on public.weekly_tracker_entries
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active((select auth.uid()))
  );

drop policy if exists "weekly_tracker_entries_update_own" on public.weekly_tracker_entries;
create policy "weekly_tracker_entries_update_own"
  on public.weekly_tracker_entries
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_active((select auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    and public.is_active((select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- weight_measurements
-- ---------------------------------------------------------------------------

drop policy if exists "weight_measurements_select_own" on public.weight_measurements;
drop policy if exists "weight_measurements_select_coach_or_admin" on public.weight_measurements;
drop policy if exists "weight_measurements_select" on public.weight_measurements;
create policy "weight_measurements_select"
  on public.weight_measurements
  for select
  to authenticated
  using (
    public.is_coach_or_admin((select auth.uid()))
    or (
      user_id = (select auth.uid())
      and public.is_active((select auth.uid()))
    )
  );

drop policy if exists "weight_measurements_insert_own" on public.weight_measurements;
create policy "weight_measurements_insert_own"
  on public.weight_measurements
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active((select auth.uid()))
  );

drop policy if exists "weight_measurements_update_own" on public.weight_measurements;
create policy "weight_measurements_update_own"
  on public.weight_measurements
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_active((select auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    and public.is_active((select auth.uid()))
  );
