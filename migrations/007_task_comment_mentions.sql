-- @mentions on task comments
ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS mentions UUID[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_task_comments_mentions ON task_comments USING GIN (mentions);

-- Per-user last-read marker per task, for unread comment badges
CREATE TABLE IF NOT EXISTS task_comment_reads (
  task_id UUID NOT NULL REFERENCES shared_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_comment_reads_user ON task_comment_reads(user_id);
