-- Add missing columns referenced by auth.ts upsert

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
