-- 008 dropped the NOT NULL constraint on token_budget but left its column DEFAULT
-- 50000 in place, so new projects (which no longer INSERT a token_budget value)
-- were silently getting 50000 anyway from the column default instead of NULL/"no cap".
ALTER TABLE projects ALTER COLUMN token_budget DROP DEFAULT;
