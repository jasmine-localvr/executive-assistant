-- Feature Settings: per-team-member feature toggles and config

ALTER TABLE team_members
  ADD COLUMN feature_inbox_management BOOLEAN DEFAULT false,
  ADD COLUMN feature_inbox_summaries BOOLEAN DEFAULT false,
  ADD COLUMN inbox_summary_cadence TEXT DEFAULT 'morning'
    CHECK (inbox_summary_cadence IN ('weekday', 'daily', 'morning', 'end_of_day', 'hourly', 'every_2_hours', 'every_4_hours')),
  ADD COLUMN feature_inbox_drafting BOOLEAN DEFAULT false,
  ADD COLUMN email_style TEXT,
  ADD COLUMN feature_calendar_scheduling BOOLEAN DEFAULT false,
  ADD COLUMN scheduling_link TEXT;
