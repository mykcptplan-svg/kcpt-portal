-- Rename Sunday Reset text columns to wins / next_week_focus and convert to jsonb string arrays.

ALTER TABLE public.weekly_tracker_entries
  RENAME COLUMN went_well TO wins;

ALTER TABLE public.weekly_tracker_entries
  RENAME COLUMN adjust_next TO next_week_focus;

ALTER TABLE public.weekly_tracker_entries
  ALTER COLUMN wins DROP DEFAULT,
  ALTER COLUMN wins TYPE jsonb USING (
    CASE
      WHEN wins IS NULL OR btrim(wins) = '' THEN '[]'::jsonb
      ELSE jsonb_build_array(wins)
    END
  ),
  ALTER COLUMN wins SET DEFAULT '[]'::jsonb,
  ALTER COLUMN wins SET NOT NULL;

ALTER TABLE public.weekly_tracker_entries
  ALTER COLUMN next_week_focus DROP DEFAULT,
  ALTER COLUMN next_week_focus TYPE jsonb USING (
    CASE
      WHEN next_week_focus IS NULL OR btrim(next_week_focus) = '' THEN '[]'::jsonb
      ELSE jsonb_build_array(next_week_focus)
    END
  ),
  ALTER COLUMN next_week_focus SET DEFAULT '[]'::jsonb,
  ALTER COLUMN next_week_focus SET NOT NULL;

COMMENT ON COLUMN public.weekly_tracker_entries.wins IS
  'Sunday Reset: up to 3 wins from the week (jsonb string array).';
COMMENT ON COLUMN public.weekly_tracker_entries.next_week_focus IS
  'Sunday Reset: up to 3 focus items for next week (jsonb string array).';
