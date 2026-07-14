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
| `OPENROUTER_API_KEY` | Real LLM ticks after Project **Start** |
| `ANTHROPIC_API_KEY` | Future orchestration (optional) |
| `TAVILY_API_KEY` | Web research (optional) |

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

### 3. Worker service
1. Second service, same repo
2. Start: `npm install --prefix backend && npm install --prefix worker && npm run start:worker`
3. Same `DATABASE_URL`, `STORAGE_PATH`, `OPENROUTER_API_KEY` (optional), `WORKER_PORT` / `PORT`

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
