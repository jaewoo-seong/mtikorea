-- Project schedule: hours budget + due date for worker time awareness
ALTER TABLE projects ADD COLUMN IF NOT EXISTS allotted_hours NUMERIC(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_projects_due_at ON projects(due_at) WHERE due_at IS NOT NULL;

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
      AND tokens_used < token_budget
      AND (due_at IS NULL OR due_at > now())
      AND (
        allotted_hours IS NULL
        OR started_at IS NULL
        OR (EXTRACT(EPOCH FROM (now() - started_at)) / 3600.0) < allotted_hours
      )
    ORDER BY started_at ASC NULLS LAST, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING p.*;
END;
$$;
