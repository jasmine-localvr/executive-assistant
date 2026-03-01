-- Add to_addresses and cc_addresses columns to classified_emails
-- These are needed for Reply All draft generation
ALTER TABLE classified_emails ADD COLUMN IF NOT EXISTS to_addresses TEXT;
ALTER TABLE classified_emails ADD COLUMN IF NOT EXISTS cc_addresses TEXT;
