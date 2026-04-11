-- Recurring todo templates: defines a repeating task that auto-generates agent_reminders
CREATE TABLE recurring_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  notes text,
  category text NOT NULL DEFAULT 'personal',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),

  -- Recurrence schedule
  recurrence_type text NOT NULL CHECK (recurrence_type IN ('daily', 'weekly', 'monthly', 'yearly')),
  recurrence_interval integer NOT NULL DEFAULT 1,          -- every N units (e.g. every 3 months)
  recurrence_day_of_week integer CHECK (recurrence_day_of_week BETWEEN 0 AND 6),  -- 0=Sun for weekly
  recurrence_day_of_month integer CHECK (recurrence_day_of_month BETWEEN 1 AND 31), -- for monthly/yearly
  recurrence_month integer CHECK (recurrence_month BETWEEN 1 AND 12),               -- for yearly
  advance_notice_days integer NOT NULL DEFAULT 0,          -- create todo this many days before due

  -- Tracking
  next_due_at date NOT NULL,                               -- next occurrence date
  last_generated_at timestamptz,                           -- when we last created a todo from this
  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_todos_member ON recurring_todos(team_member_id);
CREATE INDEX idx_recurring_todos_next_due ON recurring_todos(next_due_at) WHERE is_active = true;

-- Link generated todos back to their recurring source
ALTER TABLE agent_reminders
  ADD COLUMN IF NOT EXISTS recurring_todo_id uuid REFERENCES recurring_todos(id) ON DELETE SET NULL;

CREATE INDEX idx_agent_reminders_recurring ON agent_reminders(recurring_todo_id)
  WHERE recurring_todo_id IS NOT NULL;
