# MTI AI Platform - Master Build Guide

**One file. Complete specification. Step-by-step execution.**

---

## TABLE OF CONTENTS

1. [Quick Start](#quick-start)
2. [Skills Initialization](#skills-initialization)
3. [Project Overview](#project-overview)
4. [Tech Stack](#tech-stack)
5. [Unified Design System](#unified-design-system)
6. [Complete File Structure](#complete-file-structure)
7. [Database Schema](#database-schema)
8. [Environment Variables](#environment-variables)
9. [Build Steps (8 Phases)](#build-steps-8-phases)
10. [How Skills Work](#how-skills-work)
11. [Deployment](#deployment)

---

## QUICK START

```bash
# 1. Clone and install skills
git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git ./skills/ui-ux-pro-max
git clone https://github.com/JuliusBrussee/caveman.git ./skills/caveman
npm install --prefix ./skills/ui-ux-pro-max
npm install --prefix ./skills/caveman

# 2. Load skills
source ./skills/ui-ux-pro-max/index.js
source ./skills/caveman/index.js

# 3. Verify
echo "Skills initialized. Ready to build."

# 4. Follow STEP 1-8 below in Claude Code
```

---

## SKILLS INITIALIZATION

### Caveman Skill

**Reduces token usage by 75%**

```bash
caveman mode: full
```

**What it does:**
- Long explanations → bullet points
- Full sentences → fragments
- Code comments → minimal
- Output → concise, dense

**Example:**
```
BEFORE: "I'm going to create a new component that handles user authentication..."
AFTER: "Create auth component. NextAuth config. OAuth flow. Done."
```

### UI/UX Pro Max Skill

**Auto-applies consistent design system to all components**

```bash
ui-ux mode: pro-max
```

**What it provides:**
- Color palette (primary, accent, semantic)
- Typography scale (headings, body, mono)
- Spacing system (4px grid)
- Component patterns (buttons, cards, modals)
- Accessibility (WCAG AA)
- Responsive breakpoints
- Animation tokens

**Result:**
All buttons = same style everywhere
All modals = same structure everywhere
All tables = same styling everywhere
One design language across entire platform

---

## PROJECT OVERVIEW

**Project:** MTI AI Platform - Unified B2B Sales + Research System
**Company:** MTI Technology Co., Ltd
**Goal:** Single platform integrating:
- AI agent orchestration (task queue + work log)
- Email CRM (inbox + company auto-linking)
- Editable database (company profiles + audit trail)

**Timeline:** Build as one cohesive system (not separate modules)
**Design:** Unified across all pages (same tokens, components, layout)
**Key Principle:** Three separate sections, ONE platform

---

## TECH STACK

### Frontend
- Next.js 14+ (App Router)
- React 18+ (Hooks)
- TypeScript (strict)
- Tailwind CSS (design tokens via UI/UX skill)
- TanStack Query (data sync)

### Backend
- Node.js/Express on Railway
- PostgreSQL (Railway managed)
- TypeScript

### File Storage
- Railway Persistent Volumes ONLY (/var/data)
- 1GB limit for testing phase
- No external storage (Supabase, S3, etc)

### Real-time
- PostgreSQL LISTEN/NOTIFY (native, no Redis)
- Server-Sent Events (SSE) for task updates
- WebSockets for live work log streaming

### Auth
- NextAuth.js v5
- Google OAuth
- Role-based access (admin/member/viewer)

### External APIs
- Gmail API (email sync + send)
- OpenRouter (free agents)
- Claude API (orchestration + thinking)
- Tavily (web search for research tasks)

### Deployment
- Railway (backend + DB unified)

---

## UNIFIED DESIGN SYSTEM

### Colors
```
Primary: #2563eb (blue)
Accent: #f59e0b (amber)
Success: #10b981 (green)
Danger: #ef4444 (red)
Background: #f9fafb
Surface: #ffffff
Border: #e5e7eb
Text: #1f2937 (dark), #6b7280 (secondary)

Status Colors:
- Running: #3b82f6 (blue)
- Completed: #10b981 (green)
- Failed: #ef4444 (red)
- Queued: #6b7280 (gray)
- Paused: #f59e0b (amber)
```

### Typography
```
Headings: Inter/Poppins (sans-serif)
Body: Inter (sans-serif)
Mono: JetBrains Mono (code)
```

### Spacing
```
Base Unit: 4px
Default Border Radius: 8px
Shadows: Subtle (1 layer), Medium (2 layer), Heavy (3 layer)
```

### Components (Unified Everywhere)
```
✅ Buttons: Primary, Secondary, Ghost
✅ Cards: Elevated, Flat, Outline
✅ Modals: Full-screen, Sidebar slide, Center pop
✅ Tables: Editable cells
✅ Inputs: Text, Select, Textarea, Date
✅ Badges: Status colors
```

### Navigation (Unified Layout)
```
Left Sidebar (fixed, 280px): Always visible
Top Bar (60px): Always visible
Main Content: Flex 1 (switches per route)
Right Sidebar (optional, 320px): Context-dependent
```

---

## COMPLETE FILE STRUCTURE

```
mti-ai-platform/
│
├── app/
│   ├── layout.tsx                    # ROOT LAYOUT (unified)
│   ├── page.tsx                      # Landing → redirect to /dashboard
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── callback/[provider]/route.ts
│   │
│   ├── (app)/                        # Main app layout
│   │   ├── layout.tsx                # App-level layout (sidebars)
│   │   ├── dashboard/
│   │   │   ├── page.tsx              # Agent dashboard
│   │   │   ├── layout.tsx
│   │   │   └── task/[id]/page.tsx    # Task detail
│   │   ├── email/
│   │   │   ├── page.tsx              # Email inbox
│   │   │   ├── layout.tsx
│   │   │   ├── thread/[threadId]/page.tsx
│   │   │   └── compose/page.tsx
│   │   ├── companies/
│   │   │   ├── page.tsx              # Database editor
│   │   │   ├── layout.tsx
│   │   │   └── [id]/page.tsx
│   │   └── admin/
│   │       ├── users.tsx
│   │       ├── settings.tsx
│   │       └── organization.tsx
│   │
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── tasks/route.ts
│       ├── tasks/[id]/route.ts
│       ├── tasks/[id]/logs/route.ts
│       ├── tasks/[id]/checkpoint/route.ts
│       ├── agents/orchestrator/route.ts
│       ├── agents/sub-agents/route.ts
│       ├── companies/route.ts
│       ├── companies/[id]/route.ts
│       ├── companies/[id]/edits/route.ts
│       ├── emails/route.ts
│       ├── emails/sync/route.ts
│       ├── emails/[id]/route.ts
│       ├── emails/[id]/reply/route.ts
│       ├── emails/[id]/note/route.ts
│       └── admin/users/route.ts
│
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx
│   │   ├── LeftSidebar.tsx
│   │   ├── TopBar.tsx
│   │   ├── RightSidebar.tsx
│   │   └── UserMenu.tsx
│   │
│   ├── common/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Badge.tsx
│   │   ├── Avatar.tsx
│   │   ├── Spinner.tsx
│   │   └── Toast.tsx
│   │
│   ├── dashboard/
│   │   ├── TaskQueue.tsx
│   │   ├── TaskCard.tsx
│   │   ├── TaskProgressBar.tsx
│   │   ├── WorkLog.tsx
│   │   ├── WorkLogEntry.tsx
│   │   ├── TaskDetailPanel.tsx
│   │   ├── CreateTaskModal.tsx
│   │   ├── TaskStats.tsx
│   │   └── ResponseViewer.tsx
│   │
│   ├── email/
│   │   ├── EmailList.tsx
│   │   ├── EmailRow.tsx
│   │   ├── EmailDetail.tsx
│   │   ├── EmailThread.tsx
│   │   ├── ComposeDraft.tsx
│   │   ├── AIReplyModal.tsx
│   │   ├── FolderTree.tsx
│   │   ├── CompanyPanel.tsx
│   │   ├── CompanyQuickView.tsx
│   │   ├── InternalNoteBox.tsx
│   │   └── EmailSync.tsx
│   │
│   ├── database/
│   │   ├── CompaniesTable.tsx
│   │   ├── EditableCell.tsx
│   │   ├── CompanyRow.tsx
│   │   ├── CompanyDetailModal.tsx
│   │   ├── CompanyForm.tsx
│   │   ├── AuditTrail.tsx
│   │   ├── StatusFilter.tsx
│   │   ├── IndustryFilter.tsx
│   │   ├── SearchBox.tsx
│   │   ├── LinkedEmailsSection.tsx
│   │   ├── LinkedTasksSection.tsx
│   │   └── ImportCSVModal.tsx
│   │
│   └── admin/
│       ├── UserManagement.tsx
│       ├── UserRow.tsx
│       ├── CreateUserModal.tsx
│       ├── RoleSelector.tsx
│       └── OrganizationSettings.tsx
│
├── lib/
│   ├── db.ts                         # PostgreSQL client
│   ├── auth.ts                       # NextAuth config
│   ├── fileStorage.ts                # Railway volumes
│   ├── emailSync.ts                  # Gmail API
│   ├── orchestrator.ts               # Agent loop
│   ├── subAgents.ts                  # Free agent dispatch
│   ├── realtimeUpdates.ts            # LISTEN/NOTIFY
│   ├── types.ts                      # TypeScript types
│   ├── hooks.ts                      # Custom hooks
│   └── utils.ts                      # Helpers
│
├── public/
│   └── assets/
│
├── styles/
│   ├── globals.css
│   ├── design-tokens.css
│   └── animations.css
│
├── scripts/
│   ├── seed-db.ts
│   ├── migrate.ts
│   └── test-storage.ts
│
├── middleware.ts
├── .env.local
├── .env.example
├── tsconfig.json
├── tailwind.config.js
├── next.config.js
├── railway.json
├── package.json
└── README.md
```

---

## DATABASE SCHEMA

```sql
-- ============ ORGANIZATIONS & USERS ============

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  global_context JSONB,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- admin | member | viewer
  oauth_id TEXT,
  oauth_provider TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_users_email ON users(email);

-- ============ COMPANIES (CRM) ============

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  korean_name TEXT,
  industry TEXT,
  website TEXT,
  email TEXT,
  phone TEXT,
  
  status TEXT DEFAULT 'prospect', -- prospect | lead | customer | inactive
  notes TEXT,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE(org_id, name)
);

CREATE TABLE company_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  edited_by UUID REFERENCES users(id),
  edited_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_companies_org_id ON companies(org_id);
CREATE INDEX idx_companies_status ON companies(status);
CREATE INDEX idx_company_edits_company_id ON company_edits(company_id);
CREATE INDEX idx_company_edits_edited_at ON company_edits(edited_at DESC);

-- ============ EMAIL SYSTEM ============

CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT,
  provider TEXT DEFAULT 'gmail',
  access_token TEXT ENCRYPTED,
  refresh_token TEXT ENCRYPTED,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  
  from_address TEXT,
  to_address TEXT,
  cc TEXT[],
  subject TEXT,
  body_file_path TEXT, -- Path in /var/data
  
  gmail_message_id TEXT UNIQUE,
  direction TEXT, -- sent | received
  read BOOLEAN DEFAULT false,
  flagged BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT now(),
  received_at TIMESTAMP,
  sent_at TIMESTAMP
);

CREATE TABLE email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  subject TEXT,
  last_email_id UUID REFERENCES emails(id),
  participant_emails TEXT[],
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE email_internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_emails_company_id ON emails(company_id);
CREATE INDEX idx_emails_org_id ON emails(org_id);
CREATE INDEX idx_emails_received_at ON emails(received_at DESC);
CREATE INDEX idx_email_threads_company_id ON email_threads(company_id);

-- ============ AI AGENT TASKS ============

CREATE TABLE agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  
  title TEXT NOT NULL,
  description TEXT,
  
  global_context JSONB,
  task_context JSONB,
  task_checkpoint JSONB,
  
  status TEXT DEFAULT 'queued', -- queued | running | paused | completed | failed
  priority TEXT DEFAULT 'normal',
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  paused_at TIMESTAMP,
  
  token_budget INTEGER DEFAULT 50000,
  tokens_used INTEGER DEFAULT 0,
  estimated_cost DECIMAL DEFAULT 0
);

CREATE TABLE agent_work_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES agent_tasks(id) ON DELETE CASCADE,
  
  step_number INTEGER,
  phase TEXT, -- orchestration | sub_agent_call | synthesis
  
  action TEXT,
  sub_agent_used TEXT,
  
  prompt_sent TEXT,
  response_file_path TEXT, -- Path in /var/data
  
  duration_ms INTEGER,
  tokens_used INTEGER,
  cost_cents DECIMAL,
  accuracy_score FLOAT,
  
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE agent_task_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES agent_tasks(id) ON DELETE CASCADE,
  
  category TEXT,
  title TEXT,
  summary TEXT,
  
  findings_file_path TEXT, -- Path in /var/data
  full_response_file_path TEXT,
  
  confidence_score FLOAT,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE sub_agent_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  agent_name TEXT,
  task_type TEXT,
  
  speed_ms INTEGER,
  accuracy_score FLOAT,
  reliability_score FLOAT,
  cost_cents DECIMAL,
  
  recorded_at TIMESTAMP DEFAULT now()
);

CREATE TABLE data_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES agent_tasks(id),
  company_id UUID REFERENCES companies(id),
  
  export_type TEXT, -- docx | pdf | crm_sync
  destination TEXT,
  exported_by UUID REFERENCES users(id),
  exported_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_agent_tasks_org_id ON agent_tasks(org_id);
CREATE INDEX idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX idx_agent_work_log_task_id ON agent_work_log(task_id);
CREATE INDEX idx_agent_results_task_id ON agent_task_results(task_id);
CREATE INDEX idx_agent_work_log_created_at ON agent_work_log(created_at DESC);
```

---

## ENVIRONMENT VARIABLES

Create `.env.local`:

```bash
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>

# Google OAuth
GOOGLE_CLIENT_ID=<from-google-cloud>
GOOGLE_CLIENT_SECRET=<from-google-cloud>

# PostgreSQL (Railway)
DATABASE_URL=postgresql://<user>:<password>@<railway-host>:<port>/<database>

# File Storage (Railway)
STORAGE_PATH=/var/data

# Claude API
ANTHROPIC_API_KEY=<from-anthropic>

# OpenRouter (Free agents)
OPENROUTER_API_KEY=<from-openrouter>

# Gmail API
GMAIL_CLIENT_ID=<same-as-google-oauth>
GMAIL_CLIENT_SECRET=<same-as-google-oauth>

# Tavily (Research)
TAVILY_API_KEY=<from-tavily>

# Environment
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## BUILD STEPS (8 PHASES)

### STEP 1: INITIALIZE SKILLS

**Paste this into Claude Code:**

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

**Expected Output:**
```
✓ Skills cloned
✓ Dependencies installed
✓ Skills loaded
✓ Caveman mode: full
✓ UI/UX mode: pro-max
Ready to proceed.
```

---

### STEP 2: BUILD FOUNDATION

**Paste this into Claude Code:**

```
Build MTI AI Platform foundation.
Caveman mode: full.
Use UI/UX Pro Max Skill.

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

### STEP 3: BUILD DASHBOARD

**Paste this into Claude Code:**

```
Build dashboard section.
Caveman mode: full.
Use UI/UX Pro Max Skill.

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
Next step: Build email client.
```

---

### STEP 4: BUILD EMAIL CLIENT

**Paste this into Claude Code:**

```
Build email client section.
Caveman mode: full.
Use UI/UX Pro Max Skill.

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
   - Right: Email detail OR Composer
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

Output: Complete email client, styled, responsive, integrated.
Uses same design tokens as dashboard.
Company auto-linking via email address.
Next step: Build database editor.
```

---

### STEP 5: BUILD DATABASE EDITOR

**Paste this into Claude Code:**

```
Build database editor (CRM).
Caveman mode: full.
Use UI/UX Pro Max Skill.

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
Next step: Connect to backend APIs.
```

---

### STEP 6: BUILD BACKEND APIs

**Paste this into Claude Code:**

```
Build backend API routes.
Caveman mode: full.

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
   - Schema from this master file

8. File Storage:
   - Use lib/fileStorage.ts (Railway volumes)
   - Save work log responses to /var/data/tasks/[taskId]/

Output: Complete backend, authenticated, real-time, persistent.
Ready to wire frontend to backend.
Next step: Test integration.
```

---

### STEP 7: TEST INTEGRATION

**Paste this into Claude Code:**

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

### STEP 8: DEPLOY TO RAILWAY

**Paste this into Claude Code:**

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

## HOW SKILLS WORK

### During Development

**Reference skills in every prompt:**

```
GOOD: "Build Button component using UI/UX Pro Max Skill. 
Variants: primary, secondary, ghost. Caveman mode: full."

BAD: "Create a button component"
```

**Reuse components across sections:**

```
Dashboard Button → Email Button → Database Button
All same style (via UI/UX tokens)
All same interface (same props)
One component library
```

### Component Checklist

Once created, reuse everywhere:

```
DESIGN SYSTEM (ONE TIME)
✓ Button.tsx
✓ Card.tsx
✓ Modal.tsx
✓ Input.tsx
✓ Badge.tsx

LAYOUT (ONE TIME, REUSE ALL PAGES)
✓ LeftSidebar.tsx
✓ TopBar.tsx
✓ RightSidebar.tsx
✓ AppLayout.tsx

DASHBOARD
✓ TaskQueue.tsx
✓ WorkLog.tsx

EMAIL
✓ EmailList.tsx
✓ CompanyPanel.tsx

DATABASE
✓ CompaniesTable.tsx
✓ EditableCell.tsx
```

---

## DEPLOYMENT

### Railway Configuration

Create `railway.json`:

```json
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
```

### Build & Deploy

```bash
npm run build
railway up
```

### Verify Deployment

```
✓ Frontend loads
✓ Backend API responds
✓ Database connected
✓ File storage works
✓ Email sync works
✓ Orchestrator runs
✓ Real-time updates stream
✓ Authentication works
```

---

## COMPLETE TIMELINE

```
STEP 1: Initialize skills          ~5 min
STEP 2: Foundation                 ~1 hour
STEP 3: Dashboard                  ~1.5 hours
STEP 4: Email client               ~1.5 hours
STEP 5: Database editor            ~1.5 hours
STEP 6: Backend APIs               ~2 hours
STEP 7: Testing                    ~1 hour
STEP 8: Deployment                 ~30 min

TOTAL: ~8-10 hours
```

---

## START NOW

1. **Copy this entire file** into your project as `MTI_AI_PLATFORM_MASTER.md`
2. **Open Claude Code** (new terminal)
3. **Paste STEP 1** (Initialize skills)
4. **Wait for completion**
5. **Paste STEP 2** (Build foundation)
6. **Continue through STEP 3-8** in order

Each step builds on previous.
Skills stay active throughout.
One unified platform emerges.

**Ready? Start STEP 1 now.**

---

**THIS IS YOUR COMPLETE SPECIFICATION. FOLLOW IT EXACTLY.**

One file. Complete system. Step-by-step execution.

Build with:
- ✅ Caveman mode (75% less tokens)
- ✅ UI/UX Pro Max (unified design)
- ✅ Railway (deployment ready)
- ✅ PostgreSQL (persistence)
- ✅ One platform (not separate modules)

**READY TO BUILD.**
