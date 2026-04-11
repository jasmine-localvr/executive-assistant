-- Extend agent_reminders into a full todo system
-- Adds description, category, snooze, Slack reminder tracking, and AI context

ALTER TABLE agent_reminders
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS slack_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_priority_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Index for the reminder cron: find active todos due soon that haven't been reminded recently
CREATE INDEX IF NOT EXISTS idx_agent_reminders_due_reminder
  ON agent_reminders(due_at)
  WHERE status = 'active' AND due_at IS NOT NULL;

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_agent_reminders_category
  ON agent_reminders(team_member_id, category)
  WHERE status = 'active';
