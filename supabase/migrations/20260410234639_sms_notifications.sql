-- Add phone number for inbound SMS → EA agent
ALTER TABLE team_members
  ADD COLUMN sms_phone_number TEXT;

-- Store SMS conversation reference per team member
-- Uses agent_conversations table with channel = 'sms'
ALTER TABLE agent_conversations
  ADD COLUMN channel TEXT DEFAULT 'web';
