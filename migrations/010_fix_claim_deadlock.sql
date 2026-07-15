-- 008's claim_next_project() re-added time/hours/token filters to the SQL claim
-- query. That's wrong for the graceful wrap-up design: once a project goes over
-- its time budget *between* claims (claimed_by IS NULL, still status='running'),
-- those filters make it permanently unclaimable — so the JS-level limitsHit()
-- check that performs the wrap-up cycle (which only runs *after* a successful
-- claim) never gets a chance to fire. The project deadlocks in 'running' forever.
--
-- Budget/time enforcement belongs entirely in projectRunner.js's limitsHit(),
-- which can distinguish "just went over, claim once more to wrap up" from
-- "already wrapped up" (status no longer 'running'). The SQL layer should only
-- decide claimability, not budget.
CREATE OR REPLACE FUNCTION claim_next_project(p_worker_id TEXT)
RETURNS SETOF projects
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE projects p
  SET
    claimed_by = p_worker_id,
    claimed_at = now(),
    updated_at = now()
  WHERE p.id = (
    SELECT id FROM projects
    WHERE status = 'running'
      AND (claimed_by IS NULL OR claimed_at < now() - interval '5 minutes')
    ORDER BY started_at ASC NULLS LAST, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING p.*;
END;
$$;
