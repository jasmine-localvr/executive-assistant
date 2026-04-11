-- Add home address and investment property addresses to team_members
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS home_address text,
  ADD COLUMN IF NOT EXISTS investment_property_addresses jsonb NOT NULL DEFAULT '[]'::jsonb;
