-- LocalVR Email Triage — Initial Schema

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  slack_user_id TEXT,
  gmail_refresh_token TEXT,
  gmail_access_token TEXT,
  gmail_token_expiry TIMESTAMPTZ,
  role TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE triage_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID REFERENCES team_members(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  emails_fetched INT DEFAULT 0,
  emails_classified INT DEFAULT 0,
  tier1_count INT DEFAULT 0,
  tier2_count INT DEFAULT 0,
  tier3_count INT DEFAULT 0,
  archived_count INT DEFAULT 0,
  slack_dms_sent INT DEFAULT 0,
  status TEXT DEFAULT 'running',
  error_message TEXT
);

CREATE TABLE classified_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triage_run_id UUID REFERENCES triage_runs(id),
  team_member_id UUID REFERENCES team_members(id),
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT,
  from_address TEXT,
  subject TEXT,
  snippet TEXT,
  received_at TIMESTAMPTZ,
  tier INT NOT NULL CHECK (tier IN (1, 2, 3)),
  label TEXT,
  summary TEXT,
  priority_reason TEXT,
  suggested_action TEXT,
  suggested_assignee TEXT,
  archived BOOLEAN DEFAULT false,
  slack_dm_sent BOOLEAN DEFAULT false,
  classified_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_member_id, gmail_message_id)
);

CREATE TABLE pipeline_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triage_run_id UUID REFERENCES triage_runs(id),
  timestamp TIMESTAMPTZ DEFAULT now(),
  level TEXT DEFAULT 'info',
  step TEXT,
  message TEXT NOT NULL,
  metadata JSONB
);

-- Indexes for common queries
CREATE INDEX idx_classified_emails_member ON classified_emails(team_member_id);
CREATE INDEX idx_classified_emails_run ON classified_emails(triage_run_id);
CREATE INDEX idx_classified_emails_tier ON classified_emails(tier);
CREATE INDEX idx_triage_runs_member ON triage_runs(team_member_id);
CREATE INDEX idx_pipeline_logs_run ON pipeline_logs(triage_run_id);
CREATE INDEX idx_pipeline_logs_timestamp ON pipeline_logs(timestamp);
