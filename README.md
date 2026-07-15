# MTI CRM Platform

Email + Client CRM with project agents on **Railway Postgres** (no Supabase).

## Stack

- **Frontend:** Vite + React (CRM-first nav)
- **API:** Express + `pg` + Google OAuth / Gmail
- **Worker:** Separate process claims `running` projects until Stop / budget
- **DB / files:** Railway Postgres + `/var/data` (or local `./data`)

Reference audit tree (not runtime): `_reference/mtiV2`  
Skills: `skills/caveman`, `skills/ui-ux-pro-max`

## Quick start

```bash
cp .env.example .env
# set DATABASE_URL to Railway Postgres (or local Postgres)

npm run install:all
npm run migrate

# terminal 1
npm run dev:backend

# terminal 2
npm run start:worker

# terminal 3
npm run dev:frontend
```

Open http://localhost:5173 — use **Developer pass** (`DEV_AUTH_EMAIL` + `DEV_AUTH_PASSWORD`), or Google OAuth when configured.

Full Railway + keys guide: [docs/RAILWAY_SETUP.md](docs/RAILWAY_SETUP.md)

## Product surfaces

| Route | Purpose |
|-------|---------|
| `/clients` | Client DB + audit + notes |
| `/email` | Shared org inbox, sync, reply, organize-to-client agent |
| `/projects` | Upload → **Start/Stop**; worker runs while browser closed |
| `/documents` | Shared org documents |
| `/tasks` | Shared human tasks |
| `/admin` | Users / roles / invite |

## Railway

1. Provision **Postgres** plugin → `DATABASE_URL`
2. Deploy **API** service from `railway.json` (`npm run migrate && npm start`)
3. Deploy **Worker** service from `railway.worker.json` (`npm run start:worker`)
4. Attach volume to API (and worker if needed) at `STORAGE_PATH=/var/data`
5. Set env from `.env.example` (Google OAuth, Gmail refresh token, OpenRouter optional)

## Agents

- Draft projects use **zero tokens** until **Start**
- Background **Worker** service loops: `claim_next_project()` → one orchestrator cycle → release
- **Main model** (OpenRouter): `OPENROUTER_MAIN_MODEL` default `anthropic/claude-haiku-4.5`
- **Free sub-agents**: `OPENROUTER_SUB_MODELS` (research / draft / critique in parallel)
- Main identifies outputs; synth stages markdown docs for Approve → Shared docs
- Agent may push `progress_pct`; merged with token/time/due floors
- **Stop** → `paused` + release claim
- Set `OPENROUTER_API_KEY` on local `.env` and Railway **Worker** Variables ([keys](https://openrouter.ai/keys)); without key, local synthetic cycles still run
