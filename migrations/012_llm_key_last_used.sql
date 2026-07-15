-- Track when a sub-agent key was last used so on-demand health checks can skip
-- re-validation for up to 1 hour after a successful use.
ALTER TABLE llm_api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
