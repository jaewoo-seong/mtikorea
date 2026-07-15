-- Duration-based project budget (5 min - 12 h) replacing token/date as the primary
-- stop condition. token_budget/allotted_hours/due_at stay for legacy projects and
-- informational display; new projects use time_budget_minutes.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS time_budget_minutes INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS desired_output TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS kickoff_plan TEXT;

-- token_budget was previously NOT NULL-by-default (COALESCE'd to 50000 on insert).
-- New projects no longer set it since it's no longer an enforced stop condition —
-- allow NULL so "no cap" is representable, while old rows keep their existing value.
ALTER TABLE projects ALTER COLUMN token_budget DROP NOT NULL;

-- claim_next_project() previously required `tokens_used < token_budget` unconditionally —
-- with token_budget now nullable for new projects, that would have silently made them
-- unclaimable forever (NULL comparison is never true). Add a NULL-means-uncapped guard,
-- and gate on time_budget_minutes the same way allotted_hours already is.
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
      AND (token_budget IS NULL OR tokens_used < token_budget)
      AND (due_at IS NULL OR due_at > now())
      AND (
        allotted_hours IS NULL
        OR started_at IS NULL
        OR (EXTRACT(EPOCH FROM (now() - started_at)) / 3600.0) < allotted_hours
      )
      AND (
        time_budget_minutes IS NULL
        OR started_at IS NULL
        OR (EXTRACT(EPOCH FROM (now() - started_at)) / 60.0) < time_budget_minutes
      )
    ORDER BY started_at ASC NULLS LAST, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING p.*;
END;
$$;
