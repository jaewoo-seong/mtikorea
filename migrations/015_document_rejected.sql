-- Keep rejected agent outputs on the project (hidden from Shared Documents library)
-- instead of hard-deleting them on reject.
ALTER TABLE shared_documents DROP CONSTRAINT IF EXISTS shared_documents_visibility_check;
ALTER TABLE shared_documents
  ADD CONSTRAINT shared_documents_visibility_check
  CHECK (visibility IN ('staged', 'shared', 'rejected'));

ALTER TABLE shared_documents ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE shared_documents ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id);
