# Continuum design migration — session handoff

**Brand:** MTI AI (not "Continuum", not "MTI CRM")  
**Reference:** `.design-ref/standalone.html` + `.design-ref/design-tokens-fixed.css`  
**Source plan:** `~/.claude/plans/polymorphic-shimmying-plum.md`  
**Claude session:** `60dbe799-bbd2-4138-823e-bf8674f15e40` (hit limit before this file existed)

---

## Status snapshot (as of Phase 1 complete, uncommitted)

| Area | Status |
|------|--------|
| Design tokens (Barlow / Barlow Condensed, accent `#5980a6`, sharp corners) | Done — `tailwind.config.js`, `globals.css`, `index.html` fonts |
| Shared components (`.btn`, `.card`, `.input`, `.badge-*`, `.seg`, `.blueprint`+`.corner`) | Done — cascades to untouched pages partially |
| Email feature removal (frontend + backend routes/services; DB tables kept) | Done |
| Projects list re-skin | Done |
| Project detail re-skin (pipeline labels, nudge copy, blueprint cards) | Done |
| Brand "MTI AI" in nav + login | Done |
| Builds / backend tests | Passed in that session (`npm run build`, 14/14 tests) |
| **Git commit** | **Not committed yet** — commit Phase 1 before starting Pass 2 |

### Intentionally unchanged (product decisions)

- **Time budget** is the only hard stop; cost/tokens stay **informational** (no dollar cap enforcement).
- Google OAuth login stays (`openid email profile`); Gmail scopes + sync removed.
- DB tables `emails` / `email_accounts` left in place (reversible).

---

## Pass 2 — Layout-level re-skin of remaining app pages

Pages already inherit tokens via shared classes, but need **layout / anatomy** treatment like Projects:

1. **Documents** (`DocumentsPage.jsx`) — finder/folder feel, blueprint cards for doc rows, storage quota presentation, preview chrome.
2. **Tasks** (`TasksPage.jsx`) — list/board density, comment thread as internal comms (already built), unread badges, sharp tags.
3. **Clients** (`ClientsPage.jsx` + `ClientDetailPage.jsx`) — list cards + detail; linked-emails panel already removed.
4. **New Project** (`NewProjectPage.jsx`) — form using `.seg` for time presets, Continuum inputs, no leftover email/Gmail copy.
5. **Login** (`LoginPage.jsx`) — full Continuum splash/composition (brand already renamed; layout still light).

**Verify each page:** features unchanged; only visual/layout. `npm run build` after each page or batch.

---

## Pass 3 — Admin / Settings / shared chrome polish

1. **Admin** (`AdminPage.jsx`) — Users & access + Model/API keys tables in Continuum table/tag language.
2. **Settings** (`SettingsPage.jsx`) — account/password forms with Continuum inputs (password change WIP may still exist uncommitted from an older Cursor pass — reconcile if present).
3. **Shared leftovers:** `ConfirmButton.jsx`, `Toast.jsx`, `ErrorBoundary.jsx`, `DocumentPreview.jsx`, `AppLayout.jsx` density/spacing pass if anything still looks pre-Continuum.
4. Sweep for old rounded-full pills, purple accents, Inter/system defaults, soft card shadows that fight sharp Continuum.

---

## Pass 4 — “Wire backend to the new design”

Most APIs already exist. This pass is **UI ↔ API alignment**, not greenfield:

1. Confirm every Continuum surface uses real fields only (no mock `$cost` caps, fake agent counts, etc.).
2. Project cards: time-budget bar + informational tokens/cost line from live data.
3. Documents: folders, drag-drop, storage cap, inline preview, manual create — already backend-backed; ensure UI labels match.
4. Mid-project steering / “Nudge” ↔ `project_messages` + agent memory — copy + empty states.
5. Sub-agent health / key pool status (Admin) if useful on project detail diagnostics.
6. Optional: drop dead `emails` / `email_accounts` tables in a later migration **only if** you permanently abandon email (not required).

---

## Pass 5 — Full migration close-out

1. Visual QA pass on mobile + desktop for every route.
2. Grep for stale brand strings (`MTI CRM`, Continuum-as-product-name in UI).
3. Grep for Gmail/inbox leftovers (login `email` field OK).
4. Update `docs/RAILWAY_SETUP.md` / README brand mentions if needed.
5. Commit remaining passes; deploy Worker + API with same `DATABASE_URL`.
6. Archive or keep `.design-ref/` as the visual source of truth.

---

## How to resume next session

```text
1. Read docs/CONTINUUM_MIGRATION.md
2. git status — commit Phase 1 if still uncommitted
3. Start Pass 2 with DocumentsPage (highest traffic after Projects)
4. Reference: .design-ref/standalone.html + plan polymorphic-shimmying-plum.md
```

### Suggested Phase 1 commit message

```
Adopt Continuum design tokens, re-skin Projects, remove Email feature.

Port Barlow/Continuum shared components; redesign Projects list/detail as
MTI AI; delete Gmail/email UI and routes while keeping DB tables reversible.
```

---

## Out of scope until later (do not mix into Pass 2 unless asked)

- Re-adding email/Gmail
- Hard cost/token budget enforcement
- Renaming product away from "MTI AI"
- Worker/orchestrator logic changes (already on V2; separate from design)
