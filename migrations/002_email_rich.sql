-- Richer email client: folders/labels + HTML bodies
ALTER TABLE emails ADD COLUMN IF NOT EXISTS labels TEXT[] DEFAULT '{}';
ALTER TABLE emails ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT 'inbox';
ALTER TABLE emails ADD COLUMN IF NOT EXISTS body_html_path TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS bcc TEXT[] DEFAULT '{}';
ALTER TABLE emails ADD COLUMN IF NOT EXISTS reply_to TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT;

CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(org_id, folder);
CREATE INDEX IF NOT EXISTS idx_emails_labels ON emails USING GIN (labels);
CREATE INDEX IF NOT EXISTS idx_emails_flagged ON emails(org_id, flagged) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS idx_emails_unread ON emails(org_id, read) WHERE read = false;

-- Primary folder from Gmail labels helper constraint (soft)
-- inbox | spam | sent | trash | drafts | starred | important | all
