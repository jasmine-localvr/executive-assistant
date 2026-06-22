-- Reclaim orphaned triage runs.
--
-- The pipeline marks a run 'running' at the start and only flips it to
-- 'completed'/'failed' at the end. If the serverless function is hard-killed
-- mid-run (e.g. duration timeout), the catch block never executes and the row
-- is stranded in 'running' forever. The Gmail webhook + Slack "triage now"
-- overlap guards refuse to start a new run while one is 'running', so a single
-- orphaned run silently blocks ALL future triage for that member.
--
-- Fail out any run that has been 'running' far longer than a pipeline could
-- legitimately take (function maxDuration is 300s). Safe to re-run.
UPDATE triage_runs
SET status = 'failed',
    completed_at = now(),
    error_message = COALESCE(error_message,
      'Reclaimed: run stranded in running (likely a serverless timeout mid-run)')
WHERE status = 'running'
  AND started_at < now() - interval '15 minutes';
