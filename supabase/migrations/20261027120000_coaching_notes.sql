-- Coaching Notes: dated notes the admin writes about a member.
-- visible_to_member = false (default) keeps a note private to the admin.
-- A member can read only their OWN notes that are visible, and only while
-- their access is active. Only an admin writes (insert/update/delete).
-- Coaches have no access (private notes are for the admin).
-- Additive: one new table, nothing existing is changed.

create table public.coaching_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  note text not null,
  visible_to_member boolean not null default false,
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint coaching_notes_note_length
    check (char_length(btrim(note)) between 1 and 5000)
);

create index coaching_notes_user_created_idx
  on public.coaching_notes (user_id, created_at desc);

comment on table public.coaching_notes is
  'Admin coaching notes per member. visible_to_member=false is private. author_id/created_at/updated_at are set by trigger; updated_at only moves when the note text changes.';

-- author_id, created_at and updated_at come from the database (caller JWT),
-- never from a request body. auth.uid() is null for privileged SQL
-- (migrations, imports), in which case supplied author_id / created_at are kept.
--
-- updated_at means "the note text was edited": it equals created_at on insert,
-- and on update it only moves when the note text changes. Toggling
-- visible_to_member alone does not mark a note as edited, and a client cannot
-- set updated_at directly.
create or replace function public.coaching_notes_set_audit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.author_id := auth.uid();
      new.created_at := now();
    end if;
    new.updated_at := new.created_at;
  else
    if auth.uid() is not null then
      new.author_id := old.author_id;
      new.created_at := old.created_at;
    end if;
    if new.note is distinct from old.note then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  end if;
  return new;
end;
$$;

-- Trigger-only: never callable via RPC.
revoke execute on function public.coaching_notes_set_audit() from public;
revoke execute on function public.coaching_notes_set_audit() from anon;
revoke execute on function public.coaching_notes_set_audit() from authenticated;

create trigger coaching_notes_set_audit
  before insert or update on public.coaching_notes
  for each row
  execute function public.coaching_notes_set_audit();

alter table public.coaching_notes enable row level security;

-- Admin reads every note. A member reads only their own VISIBLE notes while
-- their access is active (same is_active check as member_focus / member_plans).
-- Private notes are never returned to a member, however they filter.
create policy "coaching_notes_select"
  on public.coaching_notes
  for select
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    or (
      user_id = (select auth.uid())
      and visible_to_member = true
      and public.is_active((select auth.uid()))
    )
  );

-- Writes: admin only. Members and coaches cannot insert, update or delete.
create policy "coaching_notes_insert_admin"
  on public.coaching_notes
  for insert
  to authenticated
  with check (public.is_admin((select auth.uid())));

create policy "coaching_notes_update_admin"
  on public.coaching_notes
  for update
  to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

create policy "coaching_notes_delete_admin"
  on public.coaching_notes
  for delete
  to authenticated
  using (public.is_admin((select auth.uid())));

-- Strip default grants first (TRUNCATE is not covered by RLS), then grant only
-- what the policies above can use.
revoke all on public.coaching_notes from anon;
revoke all on public.coaching_notes from authenticated;
grant select, insert, update, delete on public.coaching_notes to authenticated;
