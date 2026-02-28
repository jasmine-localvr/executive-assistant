-- Tier override rules: user-specific classification overrides
CREATE TABLE tier_override_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  match_type TEXT NOT NULL,
  match_value TEXT NOT NULL,
  forced_tier INT NOT NULL CHECK (forced_tier IN (1, 2, 3, 4)),
  reason TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_member_id, match_type, match_value)
);

CREATE INDEX idx_tier_override_rules_member
  ON tier_override_rules(team_member_id)
  WHERE is_active = true;
