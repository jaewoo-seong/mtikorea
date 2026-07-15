# Railway + keys — initial setup

## Where the product is

| Location | What |
|----------|------|
| Code | This repo: `/Users/jaewooseong/MTI CRM` (local, not live URL yet) |
| Local UI | http://localhost:5173 (Vite) |
| Local API | http://localhost:4000 |
| Production | After you deploy on Railway — URL like `https://your-api.up.railway.app` |

Nothing is on a public Railway domain until you create the project and deploy.

---

## What you need to give / configure

### Must have to boot

| Key / resource | Why |
|----------------|-----|
| **Railway Postgres** → `DATABASE_URL` | All data |
| **`SESSION_SECRET`** | Cookie sessions |
| **`DEV_AUTH_EMAIL` + `DEV_AUTH_PASSWORD`** | Login without Google |
| **`APP_URL`** | Frontend origin (CORS + cookies) |

### Nice to have now

| Key | Why |
|-----|-----|
| `OPENROUTER_API_KEY` | **Worker** — Haiku main + free sub-agents after Project **Start** ([openrouter.ai/keys](https://openrouter.ai/keys)) |
| `OPENROUTER_MAIN_MODEL` | Default `anthropic/claude-haiku-4.5` (paid via OpenRouter) |
| `OPENROUTER_SUB_MODELS` | Comma list of free model slugs for sub-agents |
| `TAVILY_API_KEY` | Web research (optional, unused in v1) |

### Later (skip until needed)

| Key | Why |
|-----|-----|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google login + Gmail scopes |
| `GOOGLE_CALLBACK_URL` | Must match Google Cloud console |
| `GMAIL_REFRESH_TOKEN` / `GMAIL_USER` | Shared org inbox sync/send |
| `ALLOWED_EMAIL_DOMAINS` | Restrict who can OAuth in |

You can test full CRM UI + Projects + Admin with **only** Postgres + developer pass. Email sync stays disabled until Gmail keys exist.

---

## Railway setup (step by step)

### 1. Create Railway project
1. [railway.app](https://railway.app) → New Project
2. **Add PostgreSQL** plugin  
3. Open Postgres → Variables → copy **`DATABASE_URL`**

### 2. API service
1. New Service → Deploy from GitHub (or CLI) → this repo root
2. Use start: `npm run install:all && npm run migrate && npm start`  
   (or rely on `railway.json`)
3. Variables on API service:

```text
DATABASE_URL=<from Postgres plugin — click "Add reference">
SESSION_SECRET=<long random>
NODE_ENV=production
APP_URL=https://<your-frontend-or-api-host>
API_URL=https://<your-api-host>
STORAGE_PATH=/var/data
DEV_AUTH_EMAIL=admin@mti.local
DEV_AUTH_PASSWORD=<strong password you invent>
DEV_AUTH_NAME=Admin
PORT=4000
```

4. **Volume:** mount to `/var/data` on API (and Worker if files used there)

### 3. Worker service (background agents)
1. Second service, same repo
2. Start: `npm install --prefix backend && npm install --prefix worker && npm run start:worker`
3. Variables (same volume / DB as API):

```text
DATABASE_URL=<Postgres reference>
STORAGE_PATH=/var/data
APP_URL=https://<your-app-host>
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MAIN_MODEL=anthropic/claude-haiku-4.5
OPENROUTER_SUB_MODELS=meta-llama/llama-3.3-70b-instruct:free,google/gemma-4-31b-it:free,meta-llama/llama-3.2-3b-instruct:free
WORKER_MAX_CONCURRENT=3
WORKER_SUBAGENT_CONCURRENCY=3
WORKER_ITERS_PER_CLAIM=5
OPENROUTER_MAX_RETRIES=3
WORKER_PORT=4001
```

4. How it runs: loop → `claim_next_project` → up to `WORKER_ITERS_PER_CLAIM` iterations of **plan → free sub-agents → synth → review/rethink** → release claim → re-claim while still `running`. Continues until **token budget**, **rate limit** (after retries), hours/due, or user **Stop**. Soft agent “done” does **not** stop early.

5. Progress UI: project detail **Progress command center** shows live stage + full event timeline (every planning/sub/synthesis/review/save + full errors + `stop_reason`).

Without `OPENROUTER_API_KEY`, worker still advances with local synthetic iterations (no real LLM).

### 4. Frontend
- **Option A (simplest):** API already serves `frontend/dist` after `npm run build`. One public domain = API service.
- **Option B:** Separate static host; set `APP_URL` to that origin and CORS will allow it.

### 5. First login
1. Open the public URL (or local http://localhost:5173)
2. Use **Developer pass**: email + password from env
3. You land on **Clients** as admin

### 6. Local run (same keys)

```bash
cp .env.example .env
# paste DATABASE_URL from Railway (public proxy URL works from laptop)
# set DEV_AUTH_PASSWORD
npm run install:all
npm run migrate
npm run dev:backend    # :4000
npm run start:worker
npm run dev:frontend   # :5173
```

---

## Production honesty checklist

Wired end-to-end in code, but “production level” still needs:

- [ ] Real Railway Postgres + migrate
- [ ] API + Worker deployed + volume
- [ ] Strong `SESSION_SECRET` + `DEV_AUTH_PASSWORD`
- [ ] Turn off or lock developer pass when Google is live
- [ ] Gmail keys for real email
- [ ] OpenRouter for serious agent work
- [ ] Git commit + GitHub remote deploy pipeline

---

## Fix Gmail `invalid_grant`

Means the **refresh token** is bad (revoked, expired, or minted with a different Client ID).

1. Railway → API Variables → **delete** `GMAIL_REFRESH_TOKEN` (and empty `GMAIL_USER` if it was only for that old token)
2. Confirm `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are the current Web client
3. Redeploy API
4. In the app: **Reconnect Gmail** → `/auth/google` → full Google consent
5. Accept Gmail scopes — app stores a fresh refresh token in `email_accounts`
6. Email → **Sync** again

Do **not** reuse an old refresh token from another project/computer.

## Fix Google `unauthorized_client`

Google rejected the OAuth client. Checklist:

1. OAuth client type = **Web application** (not Desktop)
2. Redirect URI *exact* match:
   - Google console: `https://YOUR-RAILWAY-HOST/auth/google/callback`
   - Railway `GOOGLE_CALLBACK_URL` = same string
   - Railway `APP_URL` = `https://YOUR-RAILWAY-HOST`
3. `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are a pair from **that same** client (re-paste, no spaces)
4. If using `GMAIL_REFRESH_TOKEN`: it must be from **this** client. If unsure, delete the var and use **Continue with Google** once (consent screen) to store a fresh token
5. Gmail API enabled on the same Google Cloud project

Developer pass still works while Google is broken.
