-- Focus This Week: dated focus points per member (0 to 5 short strings).
-- Focus for week W = the row with the greatest effective_week <= W, so a focus
-- stays in force until a newer row replaces it, and older rows are kept as
-- dated history. Additive only: no existing table or column is changed.
--
-- Writes: a member writes their own rows (max 3 items, current or next Monday,
-- source 'member'). An admin writes any member's rows (max 5 items, source
-- 'admin'). Nobody deletes. Coaches can read all rows (read-only), like the
-- other member content tables.

-- ---------------------------------------------------------------------------
-- Helpers (plain SQL, SECURITY INVOKER, no table access)
-- ---------------------------------------------------------------------------

-- items must be a jsonb array of at most 5 strings, each already trimmed and
-- 1 to 120 characters long.
create or replace function public.member_focus_items_valid(items jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(items) <> 'array' then false
    else
      jsonb_array_length(items) <= 5
      and not exists (
        select 1
        from jsonb_array_elements(items) as e
        where jsonb_typeof(e) <> 'string'
           or btrim(e #>> '{}') <> (e #>> '{}')
           or char_length(e #>> '{}') not between 1 and 120
      )
  end;
$$;

-- Monday of the current calendar week in the app's home timezone.
-- Keep in sync with HOME_TIME_ZONE in supabase/functions/member-focus/index.ts.
create or replace function public.member_focus_current_monday()
returns date
language sql
stable
set search_path = public
as $$
  select date_trunc('week', (now() at time zone 'Europe/London'))::date;
$$;

-- True when d is this week's Monday or next week's Monday (members may only
-- write those two).
create or replace function public.member_focus_week_writable_by_member(d date)
returns boolean
language sql
stable
set search_path = public
as $$
  select d = public.member_focus_current_monday()
      or d = public.member_focus_current_monday() + 7;
$$;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.member_focus (
  user_id uuid not null references public.profiles (id) on delete cascade,
  effective_week date not null,
  items jsonb not null default '[]'::jsonb,
  source text not null,
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),

  primary key (user_id, effective_week),

  constraint member_focus_monday check (extract(isodow from effective_week) = 1),
  constraint member_focus_items_valid check (public.member_focus_items_valid(items)),
  constraint member_focus_source_valid check (source in ('member', 'admin'))
);

comment on table public.member_focus is
  'Focus This Week. Focus for week W = row with the greatest effective_week <= W. items = jsonb string[] (0 to 5, each trimmed, 1 to 120 chars). source/updated_by/updated_at are set by trigger.';

-- source, updated_by and updated_at come from the database (caller JWT), never
-- from a request body. auth.uid() is null for privileged SQL (migrations,
-- seeds), in which case the supplied source/updated_by are kept.
create or replace function public.member_focus_set_audit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
    new.source := case when public.is_admin(auth.uid()) then 'admin' else 'member' end;
  end if;
  return new;
end;
$$;

-- Trigger-only: never callable via RPC.
revoke execute on function public.member_focus_set_audit() from public;
revoke execute on function public.member_focus_set_audit() from anon;
revoke execute on function public.member_focus_set_audit() from authenticated;

create trigger member_focus_set_audit
  before insert or update on public.member_focus
  for each row
  execute function public.member_focus_set_audit();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.member_focus enable row level security;

-- Same form as weekly_tracker_entries_select (20260723003000): coach/admin read
-- all rows (read-only); a member reads only their own rows while active.
create policy "member_focus_select"
  on public.member_focus
  for select
  to authenticated
  using (
    public.is_coach_or_admin((select auth.uid()))
    or (
      user_id = (select auth.uid())
      and public.is_active((select auth.uid()))
    )
  );

-- Admin: any row (the table check caps items at 5).
-- Member: own rows only, source 'member', max 3 items, current or next Monday.
create policy "member_focus_insert"
  on public.member_focus
  for insert
  to authenticated
  with check (
    public.is_admin((select auth.uid()))
    or (
      user_id = (select auth.uid())
      and public.is_active((select auth.uid()))
      and source = 'member'
      and jsonb_array_length(items) <= 3
      and public.member_focus_week_writable_by_member(effective_week)
    )
  );

create policy "member_focus_update"
  on public.member_focus
  for update
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    or (
      user_id = (select auth.uid())
      and public.is_active((select auth.uid()))
      and public.member_focus_week_writable_by_member(effective_week)
    )
  )
  with check (
    public.is_admin((select auth.uid()))
    or (
      user_id = (select auth.uid())
      and public.is_active((select auth.uid()))
      and source = 'member'
      and jsonb_array_length(items) <= 3
      and public.member_focus_week_writable_by_member(effective_week)
    )
  );

-- No delete policy. Strip default grants first (TRUNCATE is not covered by RLS).
revoke all on public.member_focus from anon;
revoke all on public.member_focus from authenticated;
grant select, insert, update on public.member_focus to authenticated;

-- ---------------------------------------------------------------------------
-- One-time seed: current Focus from the members' existing non-negotiables
-- (weekly_tracker_entries.habits) for this week and last week only.
-- Skips members that already have any member_focus row, so re-running is safe.
-- Runs as the migration role, so RLS does not apply and auth.uid() is null
-- (the supplied source / updated_by are kept by the trigger).
-- ---------------------------------------------------------------------------

insert into public.member_focus (user_id, effective_week, items, source, updated_by)
select
  t.user_id,
  t.week_start,
  seeded.arr,
  'member',
  t.user_id
from public.weekly_tracker_entries t
join public.profiles p
  on p.id = t.user_id
 and p.role = 'member'
cross join lateral (
  select jsonb_agg(b.v order by b.ord) as arr
  from (
    select a.ord, btrim(left(btrim(a.raw), 120)) as v
    from (
      select
        x.ord,
        case jsonb_typeof(x.e)
          when 'string' then x.e #>> '{}'
          when 'object' then x.e ->> 'name'
        end as raw
      from jsonb_array_elements(
        case when jsonb_typeof(t.habits) = 'array' then t.habits else '[]'::jsonb end
      ) with ordinality as x(e, ord)
      where x.ord <= 5
    ) a
  ) b
  where b.v is not null and b.v <> ''
) seeded
where t.week_start in (
    public.member_focus_current_monday(),
    public.member_focus_current_monday() - 7
  )
  and seeded.arr is not null
  and not exists (
    select 1 from public.member_focus f where f.user_id = t.user_id
  );
