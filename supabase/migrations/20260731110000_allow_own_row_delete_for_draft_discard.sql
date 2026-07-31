-- M5: "Discard draft" needs the member to be able to delete their own
-- next-week weekly_base_plans / weekly_tracker_entries row. No DELETE policy
-- has ever existed on these tables before this migration (the app has never
-- allowed deleting historical data, by design — History relies on rows never
-- disappearing).
--
-- This grants DELETE on own rows only, gated by is_active() same as the
-- existing own-row UPDATE policies. The actual restriction to "only the
-- next calendar week, never the current or a past week" is NOT enforced
-- here at the RLS layer — it is enforced in the discard-next-week-draft
-- Edge Function, which computes the target week_start itself server-side
-- and never trusts a client-supplied value. RLS here is a defense-in-depth
-- backstop (own row + active status only), not the primary safeguard.
--
-- The frontend never calls .delete() directly (per AGENTS.md architecture
-- rule) — only the discard-next-week-draft Edge Function uses this policy,
-- via the caller's own JWT (never service_role).

drop policy if exists "weekly_base_plans_delete_own" on public.weekly_base_plans;
create policy "weekly_base_plans_delete_own"
  on public.weekly_base_plans
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_active((select auth.uid()))
  );

drop policy if exists "weekly_tracker_entries_delete_own" on public.weekly_tracker_entries;
create policy "weekly_tracker_entries_delete_own"
  on public.weekly_tracker_entries
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_active((select auth.uid()))
  );
