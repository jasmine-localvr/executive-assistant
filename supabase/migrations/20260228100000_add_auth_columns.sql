-- Auth enhancements: avatar + last login tracking
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
