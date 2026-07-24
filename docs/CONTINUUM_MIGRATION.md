# Continuum design migration — session handoff

**Brand:** MTI AI (not "Continuum", not "MTI CRM")  
**Reference:** `.design-ref/standalone.html` + `.design-ref/design-tokens-fixed.css` (if present locally)

---

## Status (updated)

| Area | Status |
|------|--------|
| Design tokens + shared components | Done (Phase 1) |
| Email feature removal | Done (Phase 1) |
| Projects list + detail re-skin | Done (Phase 1) |
| Pass 2 — Documents, Tasks, Clients, New Project, Login | Done |
| Pass 3 — Admin, Settings, Toast, DocumentPreview polish | Done |
| Pass 4 — Real fields only (tokens informational, creator_name, storage, nudge) | Done / verified |
| Pass 5 — Docs update (`CONTINUUM_MIGRATION`, `RAILWAY_SETUP`), brand sweep | Done |
| Railway live config check | **Not connected** — MCP auth timed out; CLI missing. Use checklist in `docs/RAILWAY_SETUP.md` |

### Product decisions (unchanged)

- Time budget = only hard stop; tokens/cost informational.
- Google OAuth = login only; no Gmail sync.
- DB `emails` / `email_accounts` tables left in place (reversible).

---

## How to resume

1. Commit remaining Continuum Pass 2–5 UI if uncommitted.
2. On Railway dashboard: confirm API + Worker + Postgres vars per `docs/RAILWAY_SETUP.md`.
3. Optional later: drop dead email tables; further Project detail density polish.

---

## Out of scope

- Re-adding email/Gmail
- Hard cost/token budget enforcement
- Worker/orchestrator logic (separate from design)
