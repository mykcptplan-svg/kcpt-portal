-- Lifestyle & Recovery on the weekly tracker: Sleep (hours) and Alcohol (ticks).
-- Additive only: a new column with a default, so existing rows stay valid.
-- Shape: { sleep: (number|null)[7], alcohol: (boolean|null)[7] }, Mon to Sun.
-- An empty object means nothing logged.

alter table public.weekly_tracker_entries
  add column lifestyle jsonb not null default '{}'::jsonb;

comment on column public.weekly_tracker_entries.lifestyle is
  'Lifestyle & Recovery: { sleep: number|null[7] (0 to 24, 0.5 steps), alcohol: true|null[7] }, Mon to Sun. {} = nothing logged.';
