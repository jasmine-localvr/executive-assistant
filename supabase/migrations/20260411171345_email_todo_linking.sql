-- Link todos (agent_reminders) to email threads so the EA agent can track
-- what actions have been taken and monitor for replies.

-- 1. Add email context columns to agent_reminders
ALTER TABLE agent_reminders
  ADD COLUMN IF NOT EXISTS email_thread_id   text,
  ADD COLUMN IF NOT EXISTS email_message_id  text,
  ADD COLUMN IF NOT EXISTS email_subject     text,
  ADD COLUMN IF NOT EXISTS email_from        text,
  ADD COLUMN IF NOT EXISTS email_status      text DEFAULT NULL
    CHECK (email_status IN ('awaiting_reply', 'replied', 'draft_ready', 'scheduled', 'resolved')),
  ADD COLUMN IF NOT EXISTS source            text DEFAULT 'manual'
    CHECK (source IN ('manual', 'email', 'agent', 'triage'));

-- Index for quickly finding todos linked to a specific email thread
CREATE INDEX IF NOT EXISTS idx_reminders_email_thread
  ON agent_reminders (email_thread_id)
  WHERE email_thread_id IS NOT NULL;

-- Index for finding todos awaiting reply (for the reply-check cron)
CREATE INDEX IF NOT EXISTS idx_reminders_email_status
  ON agent_reminders (email_status)
  WHERE email_status IS NOT NULL;

-- 2. Create email_actions table to track the history of actions on email threads
CREATE TABLE IF NOT EXISTS email_actions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id      uuid REFERENCES agent_reminders(id) ON DELETE CASCADE,
  team_member_id   uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  email_thread_id  text NOT NULL,
  gmail_message_id text,
  action_type      text NOT NULL
    CHECK (action_type IN (
      'email_sent',
      'email_drafted',
      'reply_received',
      'follow_up_sent',
      'appointment_confirmed',
      'appointment_scheduled',
      'archived',
      'note'
    )),
  action_summary   text,          -- human-readable summary of what happened
  action_details   jsonb,         -- structured data (email body preview, draft ID, etc.)
  created_at       timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_email_actions_reminder
  ON email_actions (reminder_id);

CREATE INDEX IF NOT EXISTS idx_email_actions_thread
  ON email_actions (email_thread_id, team_member_id);

CREATE INDEX IF NOT EXISTS idx_email_actions_created
  ON email_actions (created_at DESC);
