-- Motivational quotes managed by admin (Kelly); shown randomly on Home.

create table public.motivational_quotes (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint motivational_quotes_body_nonempty check (char_length(trim(body)) > 0)
);

alter table public.motivational_quotes enable row level security;

-- Members see active quotes only; admin sees all (for management).
create policy "motivational_quotes_select_authenticated"
  on public.motivational_quotes
  for select
  to authenticated
  using (
    is_active = true
    or public.is_admin((select auth.uid()))
  );

create policy "motivational_quotes_insert_admin"
  on public.motivational_quotes
  for insert
  to authenticated
  with check (public.is_admin((select auth.uid())));

create policy "motivational_quotes_update_admin"
  on public.motivational_quotes
  for update
  to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

create policy "motivational_quotes_delete_admin"
  on public.motivational_quotes
  for delete
  to authenticated
  using (public.is_admin((select auth.uid())));

grant select, insert, update, delete on public.motivational_quotes to authenticated;

-- Placeholder quotes until Kelly replaces them via Admin.
insert into public.motivational_quotes (body, is_active) values
  ('Consistency beats perfection.', true),
  ('Small steps every day still move you forward.', true),
  ('Show up for yourself — that is enough for today.', true);
