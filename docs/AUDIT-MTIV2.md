# mtiV2 audit notes (patterns reused, not pasted)

Source: `_reference/mtiV2` @ branch `mtiV2`.

## Kept as architecture ideas

| Pattern | mtiV2 location | Reimplementation |
|---------|----------------|------------------|
| Worker claim loop | `backend/src/worker.js` + `claim_next_job` | `worker/src/index.js` + SQL `claim_next_project` |
| SKIP LOCKED claim | `backend/supabase/schema.sql` | `migrations/001_init.sql` |
| Job concurrency cap | `MAX_CONCURRENT` in worker | `WORKER_MAX_CONCURRENT` |
| Work log / steps | `agent_run_steps` / traces | `agent_work_log` |
| Gmail OAuth helpers | `services/gmailService.js` | `backend/src/services/gmailService.js` on `pg` |
| Token accounting | jobs / deep research | `projects.tokens_used` / `token_budget` |
| Railway API + worker | `railway.json` / `railway.worker.json` | same split, no Supabase |

## Explicitly not ported

- Supabase JS client, jsonb bag tables, service-role RLS
- Chat-home UI (`AssistantHome`, deep-research composer as product hub)
- Shared password `LoginGate` as final auth
- Copy-paste of deepResearchOrchestrator — project Start/Stop lifecycle instead

## Product remap

| Old mtiV2 | New MTI CRM |
|-----------|-------------|
| Chat / assistant | Optional later; Projects host agent work |
| data_lists | `clients` + `client_edits` |
| workspace files | `shared_documents` + project files on volume |
| goals / jobs | `projects` status machine |
| emails jsonb | typed `emails` / `email_threads` |
