-- Two more ways to bound a project run, alongside the existing time-budget timer:
--   timed (default) — unchanged: stop when time_budget_minutes elapses.
--   fast             — stop after a small fixed number of cycles, regardless of
--                       elapsed time; the orchestrator is told to scope down to
--                       the minimal useful output rather than explore broadly.
--   auto             — no timer; keep looping while the orchestrator is still
--                       finding genuinely useful next work, stop as soon as it
--                       reports the task done, with a cycle ceiling as a safety
--                       net against a loop that never calls itself done.
--
-- fast/auto projects leave time_budget_minutes NULL, so claim_next_project()'s
-- existing "NULL means uncapped by time" check already lets them keep being
-- claimed — no change needed there. The stop condition itself lives in
-- worker/src/projectRunner.js's limitsHit().
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_mode TEXT NOT NULL DEFAULT 'timed';

DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT projects_budget_mode_check
    CHECK (budget_mode IN ('timed', 'fast', 'auto'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing rows all used the timer, so backfill matches current behavior exactly.
UPDATE projects SET budget_mode = 'timed' WHERE budget_mode IS NULL;
