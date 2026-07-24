# Railway + keys — setup for MTI AI

## Where the product is

| Location | What |
|----------|------|
| Code | This repo (local, GitHub → Railway) |
| Local UI | http://localhost:5173 (Vite) |
| Local API | http://localhost:4000 |
| Production | After deploy — e.g. `https://your-api.up.railway.app` |

Nothing is live until you create the Railway project and deploy.

---

## Required services (3)

| Service | Role |
|---------|------|
| **Postgres** | Shared `DATABASE_URL` for API + Worker |
| **API** | Express + serves `frontend/dist`; volume at `/var/data` |
| **Worker** | Claims `running` projects; needs same `DATABASE_URL` + `OPENROUTER_API_KEY` |

Without Worker, projects stay on “waiting for worker claim”.

---

## Variables checklist

### API service

```text
DATABASE_URL=<Postgres reference>
SESSION_SECRET=<long random>
NODE_ENV=production
APP_URL=https://<public-host>
API_URL=https://<public-host>
STORAGE_PATH=/var/data
PORT=4000
DEV_AUTH_EMAIL=admin@mti.local
DEV_AUTH_PASSWORD=<strong password>
DEV_AUTH_NAME=Admin
```

Optional Google **login only** (email/Gmail feature removed from product):

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://<public-host>/auth/google/callback
ALLOWED_EMAIL_DOMAINS=mti.co.kr
```

Do **not** set Gmail scopes / `GMAIL_*` — inbox sync was removed. Dead DB tables may still exist; ignore them.

### Worker service (same repo, different start command)

```text
DATABASE_URL=<same Postgres reference>
STORAGE_PATH=/var/data
APP_URL=https://<public-host>
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MAIN_MODEL=anthropic/claude-haiku-4.5
OPENROUTER_SUB_MODELS=meta-llama/llama-3.3-70b-instruct:free,google/gemma-4-31b-it:free,meta-llama/llama-3.2-3b-instruct:free
WORKER_MAX_CONCURRENT=3
WORKER_SUBAGENT_CONCURRENCY=3
WORKER_ITERS_PER_CLAIM=5
OPENROUTER_MAX_RETRIES=3
WORKER_PORT=4001
```

Extra OpenRouter / NVIDIA keys for sub-agents: **Admin → Model & API keys** (DB), not env.

Start command example:

```text
npm install --prefix backend && npm install --prefix worker && npm run start:worker
```

### API start (see `railway.json`)

```text
npm run migrate && npm start
```

Build: `npm run install:all && npm run build` (builds frontend into API static).

---

## Production honesty checklist

- [ ] Railway Postgres + migrate on deploy
- [ ] API + **Worker** both deployed, same `DATABASE_URL`
- [ ] Volume `/var/data` on API (and Worker if it writes files)
- [ ] Strong `SESSION_SECRET` + `DEV_AUTH_PASSWORD`
- [ ] Lock / remove developer pass when Google login is live
- [ ] `OPENROUTER_API_KEY` on Worker (agents otherwise local-mock)
- [ ] `APP_URL` matches public origin (cookies / CORS)
- [ ] No leftover `GMAIL_*` vars needed

---

## Local run

```bash
cp .env.example .env
# DATABASE_URL from Railway public proxy OK from laptop
npm run install:all
npm run migrate
npm run dev:backend
npm run start:worker
npm run dev:frontend
```

---

## Google login only (`unauthorized_client`)

1. OAuth client type = **Web application**
2. Redirect URI exact: `https://YOUR-HOST/auth/google/callback`
3. Railway `GOOGLE_CALLBACK_URL` + `APP_URL` match that host
4. `GOOGLE_CLIENT_ID` / `SECRET` from the same client

Developer pass still works while Google is broken.
