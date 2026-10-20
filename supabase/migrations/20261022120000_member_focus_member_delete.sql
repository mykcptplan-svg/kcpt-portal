-- Discard draft: let a member delete their OWN member_focus row for NEXT week
-- (the row the Sunday Reset created), so "Discard draft" also removes the focus
-- they set for next week. Additive: one grant and one policy.
--
-- Never allowed: deleting admin-written rows (source = 'admin'), past or
-- current-week rows, other members' rows. No admin or coach delete.
-- Only the discard-next-week-draft Edge Function uses this, via the caller's
-- own JWT (never service_role).

grant delete on public.member_focus to authenticated;

create policy "member_focus_delete_member_next_week"
  on public.member_focus
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_active((select auth.uid()))
    and source = 'member'
    and effective_week = public.member_focus_current_monday() + 7
  );
