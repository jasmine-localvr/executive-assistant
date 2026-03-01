-- Track when the last Slack digest was sent per user (for cadence scheduling)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS last_digest_sent_at TIMESTAMPTZ;
