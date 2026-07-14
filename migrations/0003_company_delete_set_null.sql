-- emails.company_id, email_threads.company_id, and agent_tasks.company_id
-- were plain REFERENCES with the default ON DELETE NO ACTION, so deleting a
-- company with any linked email/thread/task raised an uncaught FK-violation
-- error (500) instead of succeeding. Company deletion should orphan that
-- history (keep the emails/tasks, just unlink the company) rather than
-- block the delete or cascade-destroy business records.

ALTER TABLE emails DROP CONSTRAINT emails_company_id_fkey;
ALTER TABLE emails ADD CONSTRAINT emails_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE email_threads DROP CONSTRAINT email_threads_company_id_fkey;
ALTER TABLE email_threads ADD CONSTRAINT email_threads_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE agent_tasks DROP CONSTRAINT agent_tasks_company_id_fkey;
ALTER TABLE agent_tasks ADD CONSTRAINT agent_tasks_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
