-- Personal contacts for the EA (doctors, vets, dentists, vendors, etc.)
CREATE TABLE ea_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,  -- 'doctor' | 'vet' | 'dentist' | 'vendor' | etc.
  phone text,
  email text,
  address text,
  notes text,          -- scheduling preferences, office hours, etc.
  last_appointment date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ea_contacts_member ON ea_contacts(team_member_id);
CREATE INDEX idx_ea_contacts_type ON ea_contacts(team_member_id, type);
CREATE INDEX idx_ea_contacts_name ON ea_contacts(team_member_id, name);
