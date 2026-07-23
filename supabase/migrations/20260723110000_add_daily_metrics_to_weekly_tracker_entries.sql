-- Add daily_metrics to weekly_tracker_entries for Daily Numbers (calories/protein/steps/water per day).

ALTER TABLE public.weekly_tracker_entries
  ADD COLUMN daily_metrics jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.weekly_tracker_entries.daily_metrics IS
  'Object { calories, protein, steps, water }: each number|null[7] Mon–Sun';
