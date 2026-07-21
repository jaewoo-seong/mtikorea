-- Allow documents composed directly in the UI (not uploaded, not agent-generated).
ALTER TABLE shared_documents DROP CONSTRAINT IF EXISTS shared_documents_source_check;
ALTER TABLE shared_documents ADD CONSTRAINT shared_documents_source_check
  CHECK (source IN ('upload', 'agent', 'project_file', 'manual'));
