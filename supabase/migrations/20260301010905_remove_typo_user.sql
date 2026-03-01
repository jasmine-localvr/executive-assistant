-- Remove accidentally created user jasmine@golocalvr.comq
-- Must delete in FK order: pipeline_logs → classified_emails → triage_runs → tier_override_rules → team_members

DO $$
DECLARE
  _member_id UUID;
BEGIN
  SELECT id INTO _member_id FROM team_members WHERE email = 'jasmine@golocalvr.comq';

  IF _member_id IS NULL THEN
    RAISE NOTICE 'User jasmine@golocalvr.comq not found, skipping.';
    RETURN;
  END IF;

  DELETE FROM pipeline_logs WHERE triage_run_id IN (
    SELECT id FROM triage_runs WHERE team_member_id = _member_id
  );
  DELETE FROM classified_emails WHERE team_member_id = _member_id;
  DELETE FROM triage_runs WHERE team_member_id = _member_id;
  DELETE FROM tier_override_rules WHERE team_member_id = _member_id;
  DELETE FROM team_members WHERE id = _member_id;

  RAISE NOTICE 'Deleted user jasmine@golocalvr.comq and all related data.';
END $$;
