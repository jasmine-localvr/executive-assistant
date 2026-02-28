-- 1. Drop and recreate the tier CHECK constraint to allow tier 4
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'classified_emails'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%tier%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE classified_emails DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE classified_emails ADD CONSTRAINT classified_emails_tier_check CHECK (tier IN (1, 2, 3, 4));

-- 2. Add new columns to classified_emails
ALTER TABLE classified_emails
  ADD COLUMN IF NOT EXISTS summary_oneline TEXT,
  ADD COLUMN IF NOT EXISTS needs_reply BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_reply_text TEXT,
  ADD COLUMN IF NOT EXISTS gmail_draft_id TEXT,
  ADD COLUMN IF NOT EXISTS draft_created BOOLEAN DEFAULT false;

-- 3. Add new columns to triage_runs
ALTER TABLE triage_runs
  ADD COLUMN IF NOT EXISTS tier4_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drafts_created INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slack_digest_sent BOOLEAN DEFAULT false;
