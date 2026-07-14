-- Every list/filter query added since 0001 filters by org_id (+ status) and
-- sorts by created_at, or looks companies up by email for email auto-link —
-- none of that had a matching index, so these queries were doing sequential
-- scans that only stayed fast by accident at small data volumes.

CREATE INDEX idx_companies_org_status_created ON companies(org_id, status, created_at DESC);
CREATE INDEX idx_agent_tasks_org_status_created ON agent_tasks(org_id, status, created_at DESC);

-- findCompanyIdByAddress (lib/emails.ts) looks up companies by (org_id, email)
-- on every send/reply — was an unindexed sequential scan.
CREATE INDEX idx_companies_org_email ON companies(org_id, email);

-- GET /api/emails sorts by COALESCE(received_at, sent_at, created_at) DESC;
-- a plain btree on org_id alone can't help that ORDER BY, so index the
-- expression directly.
CREATE INDEX idx_emails_org_coalesce_sort ON emails(org_id, COALESCE(received_at, sent_at, created_at) DESC);
