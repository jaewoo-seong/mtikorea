-- 0001_init.sql created email_threads (with last_email_id pointing at an
-- email) but never gave `emails` a way to reference which thread it belongs
-- to, making "all emails in this thread" unqueryable. Adding the missing FK.

ALTER TABLE emails ADD COLUMN thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE;
CREATE INDEX idx_emails_thread_id ON emails(thread_id);
