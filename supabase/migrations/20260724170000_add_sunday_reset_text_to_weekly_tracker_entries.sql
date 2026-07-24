-- Sunday Reset reflection notes (what went well / what to adjust next).

ALTER TABLE public.weekly_tracker_entries
  ADD COLUMN went_well text,
  ADD COLUMN adjust_next text;

COMMENT ON COLUMN public.weekly_tracker_entries.went_well IS
  'Sunday Reset reflection: what went well this week.';
COMMENT ON COLUMN public.weekly_tracker_entries.adjust_next IS
  'Sunday Reset reflection: what to adjust next week.';
