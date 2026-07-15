-- Mid-project steering: track which user chat messages the worker has already folded
-- into agent context/memory, so each one is delivered exactly once as "new" but keeps
-- being remembered afterward via checkpoint.memory.user_instructions.
ALTER TABLE project_messages ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_project_messages_unconsumed
  ON project_messages(project_id, created_at)
  WHERE role = 'user' AND consumed_at IS NULL;

-- Document folder tree (org-wide, Finder-style organization for shared_documents).
CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES document_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_folders_org_parent ON document_folders(org_id, parent_id);

ALTER TABLE shared_documents ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_shared_docs_folder ON shared_documents(folder_id);
