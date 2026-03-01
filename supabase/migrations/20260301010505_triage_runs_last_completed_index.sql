-- Index to efficiently find the most recent completed triage run per team member.
-- Used by the hourly cron to determine if enough time has elapsed since last run.
CREATE INDEX IF NOT EXISTS idx_triage_runs_member_completed
  ON triage_runs (team_member_id, completed_at DESC)
  WHERE status = 'completed';
