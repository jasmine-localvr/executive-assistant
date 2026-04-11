-- Agent conversations: stores chat history with the EA agent
CREATE TABLE agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  message_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_conversations_member ON agent_conversations(team_member_id);
CREATE INDEX idx_agent_conversations_updated ON agent_conversations(updated_at DESC);

-- Agent reminders / tasks
CREATE TABLE agent_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  due_at timestamptz,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_reminders_member ON agent_reminders(team_member_id);
CREATE INDEX idx_agent_reminders_status ON agent_reminders(team_member_id, status);
CREATE INDEX idx_agent_reminders_due ON agent_reminders(due_at) WHERE status = 'active';

-- Agent notes
CREATE TABLE agent_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_notes_member ON agent_notes(team_member_id);
CREATE INDEX idx_agent_notes_category ON agent_notes(team_member_id, category);
