# COPY & PASTE THIS INTO CLAUDE CODE

---

## STEP 1: PASTE THIS FIRST

```
Initialize skills for MTI AI Platform build.

Commands:
1. git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git ./skills/ui-ux-pro-max
2. git clone https://github.com/JuliusBrussee/caveman.git ./skills/caveman
3. npm install --prefix ./skills/ui-ux-pro-max
4. npm install --prefix ./skills/caveman
5. source ./skills/ui-ux-pro-max/index.js
6. source ./skills/caveman/index.js

Set modes:
- caveman mode: full
- ui-ux mode: pro-max

Skills active. Ready to build MTI AI Platform.
```

---

## STEP 2: PASTE THIS NEXT

```
Build MTI AI Platform foundation.
Caveman mode: full.
Use UI/UX Pro Max Skill.

Reference: MTI_AI_PLATFORM_BUILD_PROMPT.md

Phase 1 - Foundation:

1. Initialize Next.js 14+ (App Router, TypeScript)
   - npm create next-app@latest mti-ai-platform
   - Options: TypeScript yes, Tailwind yes, App Router yes

2. Install dependencies:
   npm install next-auth @next-auth/prisma-adapter
   npm install @supabase/supabase-js
   npm install react-query @tanstack/react-query
   npm install tailwindcss postcss autoprefixer

3. Create folder structure:
   /app, /components, /lib, /public, /styles

4. Create design tokens (styles/design-tokens.css):
   - Color variables (primary, accent, success, danger, etc)
   - Typography scale (headings, body, mono)
   - Spacing system (base 4px)
   - Shadow levels
   - Border radius
   - Animation curves

5. Create base components (use UI/UX Pro Max Skill):
   - components/common/Button.tsx (variants: primary, secondary, ghost)
   - components/common/Card.tsx (variants: elevated, flat, outline)
   - components/common/Modal.tsx (center, sidebar, fullscreen)
   - components/common/Input.tsx (text, select, textarea)
   - components/common/Badge.tsx (status colors)
   - components/common/Spinner.tsx
   - components/common/Avatar.tsx

6. Create layout components:
   - components/layout/AppLayout.tsx (main wrapper)
   - components/layout/LeftSidebar.tsx (fixed nav)
   - components/layout/TopBar.tsx (top navigation)
   - components/layout/RightSidebar.tsx (context panel)

7. Create root layout:
   - app/layout.tsx (uses AppLayout)
   - app/(app)/layout.tsx (app-level layout)

8. Setup NextAuth:
   - lib/auth.ts (NextAuth config with Google OAuth)
   - middleware.ts (protect routes)

9. Setup database client:
   - lib/db.ts (Supabase JS client)

10. Setup file storage:
    - lib/fileStorage.ts (Railway persistent volumes interface)

11. Create environment file:
    - .env.example (template)
    - .env.local (local variables)

12. Tailwind config:
    - tailwind.config.js
    - styles/globals.css

Output: Foundation ready for dashboard build.
All components styled via UI/UX Pro Max tokens.
Next step: Build dashboard page.
```

---

## STEP 3: PASTE THIS FOR DASHBOARD

```
Build dashboard section.
Caveman mode: full.
Use UI/UX Pro Max Skill.

Reference: MTI_AI_PLATFORM_BUILD_PROMPT.md (Section: SECTION 1: AI AGENT DASHBOARD)

Create:

1. Pages:
   - app/(app)/dashboard/page.tsx (main page)
   - app/(app)/dashboard/layout.tsx

2. Components (dashboard-specific):
   - components/dashboard/TaskQueue.tsx
   - components/dashboard/TaskCard.tsx
   - components/dashboard/TaskProgressBar.tsx
   - components/dashboard/WorkLog.tsx
   - components/dashboard/WorkLogEntry.tsx
   - components/dashboard/TaskDetailPanel.tsx
   - components/dashboard/CreateTaskModal.tsx
   - components/dashboard/TaskStats.tsx
   - components/dashboard/ResponseViewer.tsx

3. Hooks:
   - lib/hooks.ts → useTaskSubscription() for real-time updates

4. Layout:
   - Left: TaskQueue + WorkLog
   - Right: TaskDetailPanel (optional, when task selected)
   - Both use shared design tokens

5. Features:
   - Task list with status colors (running=blue, completed=green, queued=gray, paused=amber)
   - Progress bar (visual + percentage)
   - Work log entries with expandable responses
   - Click task → show details in right sidebar
   - Create task button → modal form

6. Styling:
   - Use design tokens (primary blue, success green, warning amber, danger red)
   - Match Card, Button, Modal components
   - Responsive (desktop first)
   - Hover states, transitions

7. Data binding:
   - Hook up to useTaskSubscription (returns tasks, loading, error)
   - Wire modal to API endpoint (POST /api/tasks)
   - Wire detail panel to task data

Output: Complete dashboard, styled, responsive, interactive.
Uses same design tokens as foundation.
Ready to connect to backend API.
Next step: Build email client using same patterns.
```

---

## STEP 4: PASTE THIS FOR EMAIL CLIENT

```
Build email client section.
Caveman mode: full.
Use UI/UX Pro Max Skill.

Reference: MTI_AI_PLATFORM_BUILD_PROMPT.md (Section: SECTION 2: EMAIL CLIENT)

Create:

1. Pages:
   - app/(app)/email/page.tsx (main page)
   - app/(app)/email/layout.tsx
   - app/(app)/email/thread/[threadId]/page.tsx (thread detail)
   - app/(app)/email/compose/page.tsx (composer)

2. Components (email-specific):
   - components/email/EmailList.tsx (inbox table)
   - components/email/EmailRow.tsx (single email)
   - components/email/EmailDetail.tsx (full email view)
   - components/email/EmailThread.tsx (conversation view)
   - components/email/ComposeDraft.tsx (reply composer)
   - components/email/AIReplyModal.tsx (AI suggestions)
   - components/email/FolderTree.tsx (folder nav)
   - components/email/CompanyPanel.tsx (right sidebar)
   - components/email/CompanyQuickView.tsx (company preview)
   - components/email/InternalNoteBox.tsx (team notes)

3. Layout:
   - Left (280px): Folder tree
   - Center (50%): Email list
   - Right: Email detail OR
   - Right: Composer
   - Far right (320px): Company panel (auto-linked)

4. Features:
   - Email list with status (read/unread)
   - Thread view (conversation chain)
   - Auto-link email to company by from_address
   - Company panel shows: status, notes, recent emails, related tasks
   - Compose reply with AI suggestions
   - Internal notes (team only)
   - Folder tree (Inbox, Sent, Drafts, Labels)

5. Styling:
   - Reuse Button, Card, Modal from foundation
   - Company panel: same card style as dashboard detail panel
   - Email list: table from database editor pattern
   - Compose: textarea + buttons (same style)
   - Match dashboard color palette exactly

6. Data binding:
   - Hook: useEmails() for email list (real-time via SSE)
   - Hook: useCompanyFromEmail(email) auto-link
   - Wire reply to API endpoint (POST /api/emails/send)
   - Wire internal note to API endpoint (POST /api/emails/[id]/note)

Output: Complete email client, styled, responsive, integrated with company database.
Uses same design tokens as dashboard.
Company auto-linking via email address.
Ready to connect to Gmail API + Supabase.
Next step: Build database editor.
```

---

## STEP 5: PASTE THIS FOR DATABASE EDITOR

```
Build database editor (CRM).
Caveman mode: full.
Use UI/UX Pro Max Skill.

Reference: MTI_AI_PLATFORM_BUILD_PROMPT.md (Section: SECTION 3: DATABASE EDITOR)

Create:

1. Pages:
   - app/(app)/companies/page.tsx (main page)
   - app/(app)/companies/layout.tsx
   - app/(app)/companies/[id]/page.tsx (detail modal)

2. Components (database-specific):
   - components/database/CompaniesTable.tsx (main table)
   - components/database/EditableCell.tsx (inline edit)
   - components/database/CompanyRow.tsx (single row)
   - components/database/CompanyDetailModal.tsx (full view)
   - components/database/CompanyForm.tsx (edit form)
   - components/database/AuditTrail.tsx (edit history)
   - components/database/StatusFilter.tsx
   - components/database/IndustryFilter.tsx
   - components/database/SearchBox.tsx
   - components/database/LinkedEmailsSection.tsx (emails for company)
   - components/database/LinkedTasksSection.tsx (tasks for company)
   - components/database/ImportCSVModal.tsx

3. Layout:
   - Top: Filters (status, industry), search, action buttons
   - Main: Table (fully editable cells)
   - Click row → detail modal

4. Features:
   - Click cell to edit inline
   - Blur to save (auto-persist to DB)
   - Show edit history (who changed what, when)
   - Auto-link emails from that company
   - Auto-link tasks related to that company
   - Status colors (prospect=gray, lead=blue, customer=green, inactive=red)
   - Export to CSV
   - Import from CSV

5. Styling:
   - Reuse Table, Button, Modal from foundation
   - Editable cell: click effect, border highlight, hover
   - Status badges: use Badge component
   - Match dashboard + email colors exactly

6. Data binding:
   - Hook: useCompanies() for table data (real-time)
   - Wire edit to API endpoint (PATCH /api/companies/[id])
   - Log edits (POST /api/companies/[id]/edits)
   - Wire filter to query params
   - Wire search to query params

Output: Complete database editor, styled, editable, audit-tracked.
Uses same design tokens as dashboard + email.
Fully integrated with email + task data.
Ready to deploy as unified platform.
Next step: Connect to backend APIs.
```

---

## STEP 6: PASTE THIS FOR BACKEND APIs

```
Build backend API routes.
Caveman mode: full.

Reference: MTI_AI_PLATFORM_BUILD_PROMPT.md (Database Schema section)

Create:

1. Authentication:
   - app/api/auth/[...nextauth]/route.ts (NextAuth handler)

2. Tasks API:
   - app/api/tasks/route.ts (GET list, POST create)
   - app/api/tasks/[id]/route.ts (PATCH update, DELETE)
   - app/api/tasks/[id]/logs/route.ts (GET work log, SSE stream)
   - app/api/tasks/[id]/checkpoint/route.ts (PATCH checkpoint)

3. Companies API:
   - app/api/companies/route.ts (GET list, POST create)
   - app/api/companies/[id]/route.ts (PATCH update, DELETE)
   - app/api/companies/[id]/edits/route.ts (GET audit trail)
   - app/api/companies/import/route.ts (POST CSV import)

4. Emails API:
   - app/api/emails/route.ts (GET inbox, POST send)
   - app/api/emails/sync/route.ts (POST Gmail sync)
   - app/api/emails/[id]/route.ts (GET single)
   - app/api/emails/[id]/reply/route.ts (POST reply)
   - app/api/emails/[id]/note/route.ts (POST internal note)
   - app/api/emails/suggest/route.ts (POST AI suggestions)

5. Admin API:
   - app/api/admin/users/route.ts (GET list, POST create)
   - app/api/admin/users/[id]/route.ts (PATCH role, DELETE)

6. Features per route:
   - Auth check (NextAuth middleware)
   - Rate limiting
   - Error handling (HTTP codes)
   - Audit logging (for edits)
   - Real-time updates (notify subscribers)
   - Transaction safety (Postgres)

7. Database:
   - Use lib/db.ts (Supabase JS client)
   - Schema from MTI_AI_PLATFORM_BUILD_PROMPT.md

8. File Storage:
   - Use lib/fileStorage.ts (Railway volumes)
   - Save work log responses to /var/data/tasks/[taskId]/

Output: Complete backend, authenticated, real-time, persistent.
Ready to wire frontend to backend.
Next step: Test frontend → backend integration.
```

---

## STEP 7: PASTE THIS FOR TESTING

```
Test full integration.
Caveman mode: full.

Test flow:

1. Create task → Dashboard shows in queue → Task starts running
2. Orchestrator runs → Work log updates real-time
3. Email syncs → Shows in inbox → Auto-link to company
4. Edit company → Audit trail records change
5. Create user → Admin panel assigns role
6. Email threads → Link to company profile → Show linked tasks

Verify:
- [ ] Dashboard real-time updates (SSE stream)
- [ ] Email inbox syncs (Gmail API)
- [ ] Company edits logged (audit trail)
- [ ] Authentication works (NextAuth)
- [ ] File storage works (1GB test)
- [ ] Design consistent (buttons, colors, layout)
- [ ] Mobile responsive (all pages)
- [ ] Error handling (show toasts)
- [ ] Permissions work (admin/member/viewer)

Output: Fully working, tested, unified platform.
Ready for production deployment.
```

---

## STEP 8: PASTE THIS FOR DEPLOYMENT

```
Deploy to Railway.
Caveman mode: full.

Steps:

1. Create railway.json in root:
{
  "build": {
    "builder": "nixpacks"
  },
  "start": "npm run start",
  "volumes": {
    "/var/data": "mti-ai-research-volume"
  },
  "environmentVariables": {
    "NODE_ENV": "production",
    "NEXTAUTH_URL": "${{ Railway.serviceName }}.up.railway.app"
  }
}

2. Create .env.production with all secrets

3. Deploy:
   railway up

4. Verify:
   - [ ] Frontend loads (https://...)
   - [ ] Backend API responds
   - [ ] Database connected
   - [ ] File storage works
   - [ ] Email sync works
   - [ ] Orchestrator runs

Output: Live on Railway.
MTI AI Platform ready for production use.
All features working:
- Dashboard with real-time agent monitoring
- Email client with company auto-linking
- Editable CRM database
- Audit trail logging
- Role-based access control
- File storage (1GB)
- PostgreSQL persistence

DONE.
```

---

## READY TO START?

Copy and paste steps in order:

1. Paste: Initialize skills
2. Wait for completion
3. Paste: Build foundation
4. Wait for completion
5. Paste: Build dashboard
6. Wait for completion
7. Paste: Build email client
8. Wait for completion
9. Paste: Build database editor
10. Wait for completion
11. Paste: Build backend APIs
12. Wait for completion
13. Paste: Test integration
14. Verify all works
15. Paste: Deploy to Railway

Total time: ~6-8 hours for complete build + deployment

**Start step 1 now.**
