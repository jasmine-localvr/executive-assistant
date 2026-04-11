-- Add work address to team_members
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS work_address text;
