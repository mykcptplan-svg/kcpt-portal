-- Allow multiple dated measurement entries per week.
-- PK becomes (user_id, measured_on); week_start stays as a grouping column.

alter table public.weight_measurements
  add column measured_on date;

update public.weight_measurements
  set measured_on = week_start
  where measured_on is null;

alter table public.weight_measurements
  alter column measured_on set not null;

alter table public.weight_measurements
  drop constraint weight_measurements_pkey;

alter table public.weight_measurements
  add primary key (user_id, measured_on);

create index weight_measurements_user_id_week_start_idx
  on public.weight_measurements (user_id, week_start);
