-- Split inbox_summary_cadence into 3 separate columns

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS summary_weekly_schedule TEXT DEFAULT 'weekday',
  ADD COLUMN IF NOT EXISTS summary_daily_summaries TEXT[] DEFAULT '{morning}',
  ADD COLUMN IF NOT EXISTS summary_update_frequency TEXT DEFAULT 'every_2_hours';

-- Migrate existing data (cast CASE to text[] for the array column)
UPDATE team_members SET
  summary_weekly_schedule = CASE
    WHEN inbox_summary_cadence IN ('weekday', 'daily') THEN inbox_summary_cadence
    ELSE 'weekday'
  END,
  summary_daily_summaries = (CASE
    WHEN inbox_summary_cadence = 'morning' THEN '{morning}'
    WHEN inbox_summary_cadence = 'end_of_day' THEN '{end_of_day}'
    ELSE '{morning}'
  END)::text[],
  summary_update_frequency = CASE
    WHEN inbox_summary_cadence IN ('hourly', 'every_2_hours', 'every_4_hours') THEN inbox_summary_cadence
    ELSE 'every_2_hours'
  END
WHERE inbox_summary_cadence IS NOT NULL;

-- Drop old column
ALTER TABLE team_members DROP COLUMN IF EXISTS inbox_summary_cadence;
