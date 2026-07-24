-- Rebuild shared_tasks as an internal *request* system.
--
-- The original model was a kanban card with two bolt-ons: a single assignee, a
-- single attached document (shared_tasks.document_id), and a `feedback_requested`
-- boolean. Approve/reject just flipped `status` and injected a fake comment whose
-- body started with "Rejected: ". That can't express what the workspace actually
-- needs: several approvers, several attachments, bystanders joining a thread, and
-- a decision that is recorded as its own fact rather than inferred from status.
--
-- This migration keeps the old columns in place and backfills the new tables from
-- them, so existing rows keep working while the API moves over.

-- --- shared_tasks: what is being asked, and what was decided -----------------

ALTER TABLE shared_tasks ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'request';
ALTER TABLE shared_tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE shared_tasks ADD COLUMN IF NOT EXISTS decision TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE shared_tasks ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES users(id);
ALTER TABLE shared_tasks ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE shared_tasks ADD CONSTRAINT shared_tasks_kind_check
    CHECK (kind IN ('request', 'approval', 'idea', 'question'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE shared_tasks ADD CONSTRAINT shared_tasks_priority_check
    CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE shared_tasks ADD CONSTRAINT shared_tasks_decision_check
    CHECK (decision IN ('pending', 'approved', 'rejected', 'changes_requested'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Requests that were created as explicit feedback asks become 'approval' kind;
-- everything else stays a plain 'request'.
UPDATE shared_tasks SET kind = 'approval'
 WHERE feedback_requested IS TRUE AND kind = 'request';

-- Tasks already closed out carry a decision so the inbox filters agree with the
-- board state they were left in.
UPDATE shared_tasks SET decision = 'approved'
 WHERE status = 'done' AND decision = 'pending';

-- --- Participants: many approvers, plus bystanders who joined ---------------

CREATE TABLE IF NOT EXISTS task_participants (
  task_id UUID NOT NULL REFERENCES shared_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- owner    = raised the request
  -- approver = expected to approve/reject; drives the "Needs my approval" inbox
  -- follower = tagged along (commented, or was @mentioned); notified, not blocking
  role TEXT NOT NULL DEFAULT 'follower' CHECK (role IN ('owner', 'approver', 'follower')),
  added_by UUID REFERENCES users(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_participants_user ON task_participants(user_id, role);

-- Backfill from the single-assignee model.
INSERT INTO task_participants (task_id, user_id, role, added_by)
SELECT t.id, t.created_by, 'owner', t.created_by
  FROM shared_tasks t
 WHERE t.created_by IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;

INSERT INTO task_participants (task_id, user_id, role, added_by)
SELECT t.id, t.assignee_id, 'approver', t.created_by
  FROM shared_tasks t
 WHERE t.assignee_id IS NOT NULL
ON CONFLICT (task_id, user_id) DO UPDATE SET role = 'approver';

-- Anyone who ever commented was already part of the conversation.
INSERT INTO task_participants (task_id, user_id, role, added_by)
SELECT DISTINCT c.task_id, c.author_id, 'follower', c.author_id
  FROM task_comments c
 WHERE c.author_id IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;

-- --- Attachments: many documents per request --------------------------------

CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES shared_tasks(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES shared_documents(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_doc ON task_attachments(document_id);

INSERT INTO task_attachments (task_id, document_id, added_by)
SELECT t.id, t.document_id, t.created_by
  FROM shared_tasks t
 WHERE t.document_id IS NOT NULL
ON CONFLICT (task_id, document_id) DO NOTHING;

-- --- Events: decisions and state changes as first-class facts ---------------
--
-- Rendered inline with comments to form one activity thread, which is why the
-- reject-writes-a-comment hack can go away.

CREATE TABLE IF NOT EXISTS task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES shared_tasks(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN (
    'created', 'status_changed', 'approved', 'rejected', 'changes_requested',
    'reopened', 'participant_added', 'participant_removed',
    'attachment_added', 'attachment_removed'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at);

INSERT INTO task_events (task_id, org_id, actor_id, type, payload, created_at)
SELECT t.id, t.org_id, t.created_by, 'created', '{}'::jsonb, COALESCE(t.created_at, now())
  FROM shared_tasks t;

-- Comments the old reject flow wrote are historical prose, not events; they stay
-- as comments so no thread loses content.

CREATE INDEX IF NOT EXISTS idx_shared_tasks_inbox
  ON shared_tasks(org_id, status, decision, updated_at DESC);
