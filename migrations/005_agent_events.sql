-- Full agent event timeline + stop reasons for continuous loop

ALTER TABLE projects ADD COLUMN IF NOT EXISTS stop_reason TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS agent_iteration INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS project_agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cycle INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL,
  action TEXT,
  model TEXT,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'started',
  summary TEXT,
  detail TEXT,
  error_full TEXT,
  tokens_used INTEGER DEFAULT 0,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_project_created
  ON project_agent_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_project_cycle
  ON project_agent_events(project_id, cycle, seq);
