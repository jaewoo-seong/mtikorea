-- Client rich profile markdown
ALTER TABLE clients ADD COLUMN IF NOT EXISTS profile_markdown TEXT DEFAULT '';

-- Documents: staged (project temp) vs approved shared
ALTER TABLE shared_documents ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'shared'
  CHECK (visibility IN ('staged', 'shared'));
ALTER TABLE shared_documents ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE shared_documents ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE shared_documents ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'upload'
  CHECK (source IN ('upload', 'agent', 'project_file'));

-- Backfill existing rows as shared
UPDATE shared_documents SET visibility = 'shared' WHERE visibility IS NULL OR visibility = '';

CREATE INDEX IF NOT EXISTS idx_shared_docs_visibility ON shared_documents(org_id, visibility);
CREATE INDEX IF NOT EXISTS idx_shared_docs_project_vis ON shared_documents(project_id, visibility);

-- Agent chat-style responses on a project (separate from work log steps)
CREATE TABLE IF NOT EXISTS project_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'error')),
  content TEXT NOT NULL,
  document_id UUID REFERENCES shared_documents(id) ON DELETE SET NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_messages_project ON project_messages(project_id, created_at);

-- Tasks: internal feedback requests
ALTER TABLE shared_tasks ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES shared_documents(id) ON DELETE SET NULL;
ALTER TABLE shared_tasks ADD COLUMN IF NOT EXISTS feedback_requested BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE shared_tasks ADD COLUMN IF NOT EXISTS feedback_notes TEXT;
