# MTI AI Platform - Complete Claude Code Build Prompt

## INITIALIZE SKILLS (RUN FIRST)

```bash
# Fetch and initialize UI/UX Pro Max Skill
git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git ./skills/ui-ux-pro-max
npm install --prefix ./skills/ui-ux-pro-max

# Fetch and initialize Caveman Skill
git clone https://github.com/JuliusBrussee/caveman.git ./skills/caveman
npm install --prefix ./skills/caveman

# Load skills into context
source ./skills/ui-ux-pro-max/index.js
source ./skills/caveman/index.js
```

**ALL subsequent communication uses: caveman mode (full intensity)**

---

## PROJECT OVERVIEW

**Project:** MTI AI Platform - Unified B2B Sales + Research System
**Company:** MTI Technology Co., Ltd
**Goal:** Single platform integrating AI agent orchestration + Email CRM + Editable company database
**Timeline:** Build as one cohesive system (not separate modules)
**Design System:** Unified across all pages (dashboard, email, database editor)

---

## TECH STACK (FINAL CONFIRMATION)

**Frontend:**
- Next.js 14+ (App Router)
- React 18+ (Hooks)
- TypeScript (strict)
- Tailwind CSS (design tokens via UI/UX skill)
- TanStack Query (data sync)

**Backend:**
- Node.js/Express on Railway
- PostgreSQL (Railway managed)
- TypeScript

**File Storage:**
- Railway Persistent Volumes ONLY (/var/data)
- 1GB limit for testing phase
- No external storage (Supabase, S3, etc) for now

**Real-time:**
- PostgreSQL LISTEN/NOTIFY (native, no Redis)
- Server-Sent Events (SSE) for task updates
- WebSockets for live work log streaming

**Auth:**
- NextAuth.js v5
- Google OAuth
- Role-based access (admin/member/viewer)

**External APIs:**
- Gmail API (email sync + send)
- OpenRouter (free agents)
- Claude API (orchestration + thinking)
- Tavily (web search for research tasks)

**Deployment:**
- Railway (backend + DB unified)
- Vercel OR Railway (frontend)

---

## UNIFIED DESIGN SYSTEM

**Use UI/UX Pro Max Skill for all pages.**

**Design Tokens (consistent everywhere):**

```
Colors:
- Primary: #2563eb (blue)
- Accent: #f59e0b (amber)
- Success: #10b981 (green)
- Danger: #ef4444 (red)
- Background: #f9fafb
- Surface: #ffffff
- Border: #e5e7eb
- Text: #1f2937 (dark), #6b7280 (secondary)

Typography:
- Headings: Inter/Poppins (sans-serif)
- Body: Inter (sans-serif)
- Mono: JetBrains Mono (code)

Spacing: 4px base unit
Border Radius: 8px default
Shadows: Subtle (1 layer), Medium (2 layer), Heavy (3 layer)

Components (UNIFIED):
- Buttons: Primary, Secondary, Ghost (consistent everywhere)
- Cards: Elevated, Flat, Outline (consistent everywhere)
- Modals: Full-screen, Sidebar slide, Center pop (consistent everywhere)
- Tables: Editable cells (consistent everywhere)
- Inputs: Text, Select, Textarea, Date (consistent everywhere)
```

**All three sections use same component library:**
- ✅ Dashboard buttons = Email buttons = Database buttons
- ✅ Dashboard modals = Email modals = Database modals
- ✅ Dashboard tables = Email tables = Database tables
- ✅ Same color palette everywhere
- ✅ Same fonts everywhere
- ✅ Same spacing everywhere

**Navigation (Unified Layout):**
- Left sidebar (fixed, 280px): Always visible
- Top bar (60px): Always visible
- Main content: Flex 1 (switches per route)
- Right sidebar (optional, 320px): Context-dependent

---

## COMPLETE FILE STRUCTURE

```
mti-ai-platform/
│
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # ROOT LAYOUT (unified)
│   ├── page.tsx                      # Landing → redirect to /dashboard
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── callback/[provider]/route.ts
│   │
│   ├── (app)/                        # Main app layout
│   │   ├── layout.tsx                # App-level layout (sidebars)
│   │   │
│   │   ├── dashboard/
│   │   │   ├── page.tsx              # Agent dashboard (main)
│   │   │   ├── layout.tsx
│   │   │   └── task/[id]/page.tsx    # Task detail view
│   │   │
│   │   ├── email/
│   │   │   ├── page.tsx              # Email inbox
│   │   │   ├── layout.tsx
│   │   │   ├── thread/[threadId]/page.tsx  # Thread detail
│   │   │   └── compose/page.tsx      # New email composer
│   │   │
│   │   ├── companies/
│   │   │   ├── page.tsx              # Companies database
│   │   │   ├── layout.tsx
│   │   │   └── [id]/page.tsx         # Company detail modal
│   │   │
│   │   └── admin/
│   │       ├── users.tsx             # User management
│   │       ├── settings.tsx
│   │       └── organization.tsx
│   │
│   └── api/                          # Backend routes
│       ├── auth/[...nextauth]/route.ts
│       │
│       ├── tasks/
│       │   ├── route.ts              # POST create, GET list
│       │   ├── [id]/route.ts         # PATCH update, DELETE
│       │   ├── [id]/logs/route.ts    # GET work log (SSE stream)
│       │   ├── [id]/checkpoint/route.ts
│       │   └── [id]/pause/route.ts
│       │
│       ├── agents/
│       │   ├── orchestrator/route.ts # POST trigger orchestrator
│       │   ├── sub-agents/route.ts   # Free agent dispatcher
│       │   └── performance/route.ts  # GET agent metrics
│       │
│       ├── companies/
│       │   ├── route.ts              # POST create, GET list
│       │   ├── [id]/route.ts         # PATCH update, DELETE
│       │   ├── [id]/edits/route.ts   # GET audit trail
│       │   └── import/route.ts       # POST CSV import
│       │
│       ├── emails/
│       │   ├── route.ts              # GET inbox, POST send
│       │   ├── sync/route.ts         # POST Gmail sync
│       │   ├── [id]/route.ts         # GET single email
│       │   ├── [id]/reply/route.ts   # POST reply
│       │   ├── [id]/note/route.ts    # POST internal note
│       │   └── suggest/route.ts      # POST AI reply suggestions
│       │
│       └── admin/
│           ├── users/route.ts
│           ├── users/[id]/route.ts
│           └── organization/route.ts
│
├── components/                       # Unified React components
│   │
│   ├── layout/                       # Shared layout components
│   │   ├── AppLayout.tsx             # Main layout wrapper
│   │   ├── LeftSidebar.tsx           # Fixed left nav
│   │   ├── TopBar.tsx                # Top navigation + search
│   │   ├── RightSidebar.tsx          # Context panel
│   │   └── UserMenu.tsx
│   │
│   ├── common/                       # Shared across all sections
│   │   ├── Button.tsx                # Unified button
│   │   ├── Card.tsx                  # Unified card
│   │   ├── Modal.tsx                 # Unified modal
│   │   ├── Input.tsx                 # Unified input
│   │   ├── Select.tsx                # Unified select
│   │   ├── Badge.tsx                 # Status badges
│   │   ├── Avatar.tsx
│   │   ├── Spinner.tsx
│   │   └── Toast.tsx                 # Notifications
│   │
│   ├── dashboard/                    # Dashboard-specific
│   │   ├── TaskQueue.tsx             # Task list
│   │   ├── TaskCard.tsx              # Single task card
│   │   ├── TaskProgressBar.tsx       # Progress visualization
│   │   ├── WorkLog.tsx               # Activity feed
│   │   ├── WorkLogEntry.tsx          # Single log entry
│   │   ├── TaskDetailPanel.tsx       # Right sidebar details
│   │   ├── CreateTaskModal.tsx       # Task creation
│   │   ├── TaskStats.tsx             # Summary stats
│   │   └── ResponseViewer.tsx        # Expandable response viewer
│   │
│   ├── email/                        # Email-specific
│   │   ├── EmailList.tsx             # Email inbox table
│   │   ├── EmailRow.tsx              # Single email row
│   │   ├── EmailDetail.tsx           # Full email view
│   │   ├── EmailThread.tsx           # Threaded conversation
│   │   ├── ComposeDraft.tsx          # Reply composer
│   │   ├── AIReplyModal.tsx          # AI suggestion modal
│   │   ├── FolderTree.tsx            # Folder navigation
│   │   ├── CompanyPanel.tsx          # Right sidebar company
│   │   ├── CompanyQuickView.tsx      # Company preview card
│   │   ├── InternalNoteBox.tsx       # Team notes section
│   │   └── EmailSync.tsx             # Sync status
│   │
│   ├── database/                     # Database editor-specific
│   │   ├── CompaniesTable.tsx        # Main table
│   │   ├── EditableCell.tsx          # Inline edit cell
│   │   ├── CompanyRow.tsx            # Single row
│   │   ├── CompanyDetailModal.tsx    # Full company view
│   │   ├── CompanyForm.tsx           # Edit form
│   │   ├── AuditTrail.tsx            # Edit history
│   │   ├── StatusFilter.tsx          # Filter UI
│   │   ├── IndustryFilter.tsx
│   │   ├── SearchBox.tsx
│   │   ├── LinkedEmailsSection.tsx   # Emails linked to company
│   │   ├── LinkedTasksSection.tsx    # Tasks linked to company
│   │   └── ImportCSVModal.tsx
│   │
│   └── admin/                        # Admin-specific
│       ├── UserManagement.tsx
│       ├── UserRow.tsx
│       ├── CreateUserModal.tsx
│       ├── RoleSelector.tsx
│       └── OrganizationSettings.tsx
│
├── lib/                              # Utilities & services
│   ├── db.ts                         # PostgreSQL client (Supabase JS)
│   ├── auth.ts                       # NextAuth config
│   ├── fileStorage.ts                # Railway persistent volumes
│   ├── emailSync.ts                  # Gmail API integration
│   ├── orchestrator.ts               # Agent orchestration loop
│   ├── subAgents.ts                  # Free agent dispatch
│   ├── realtimeUpdates.ts            # PostgreSQL LISTEN/NOTIFY
│   ├── types.ts                      # TypeScript interfaces
│   ├── hooks.ts                      # Custom React hooks
│   └── utils.ts                      # Helper functions
│
├── public/
│   └── assets/
│       ├── logo.svg
│       ├── icons/
│       └── images/
│
├── styles/
│   ├── globals.css                   # Tailwind + design tokens
│   ├── design-tokens.css             # Color, spacing, typography vars
│   └── animations.css                # Transitions
│
├── scripts/
│   ├── seed-db.ts                    # Initialize database
│   ├── migrate.ts                    # Run migrations
│   └── test-storage.ts               # Test file storage
│
├── middleware.ts                     # NextAuth middleware
├── .env.local                        # Environment variables
├── .env.example
├── .gitignore
├── tsconfig.json
├── tailwind.config.js                # Tailwind config
├── tailwind.config.ts                # Extended with design tokens
├── next.config.js
├── railway.json                      # Railway config
├── package.json
├── package-lock.json
└── README.md
```

---

## DATABASE SCHEMA (PostgreSQL)

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

## DESIGN SYSTEM (TAILWIND + UI/UX SKILL)

Use UI/UX Pro Max Skill for all component design.

**Color Palette (CSS Variables):**
```css
:root {
  /* Functional Colors */
  --color-primary: #2563eb;
  --color-accent: #f59e0b;
  --color-success: #10b981;
  --color-danger: #ef4444;
  --color-warning: #f59e0b;
  
  /* Semantic Colors */
  --color-background: #f9fafb;
  --color-surface: #ffffff;
  --color-border: #e5e7eb;
  --color-text: #1f2937;
  --color-text-secondary: #6b7280;
  
  /* Component Colors */
  --color-link: #2563eb;
  --color-link-hover: #1d4ed8;
  --color-input-focus: #3b82f6;
  
  /* Status Colors */
  --color-status-running: #3b82f6;
  --color-status-completed: #10b981;
  --color-status-failed: #ef4444;
  --color-status-queued: #6b7280;
  --color-status-paused: #f59e0b;
}
```

**Component Library (Unified):**

All buttons same style (dashboard, email, database):
```tsx
<Button variant="primary">Action</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Subtle</Button>
```

All modals same structure:
```tsx
<Modal title="Title" onClose={}>
  <div>Content</div>
  <Modal.Footer>
    <Button>Cancel</Button>
    <Button variant="primary">Confirm</Button>
  </Modal.Footer>
</Modal>
```

All tables same styling:
```tsx
<Table>
  <Table.Header>...</Table.Header>
  <Table.Body>
    <Table.Row>
      <Table.Cell editable={true}>Content</Table.Cell>
    </Table.Row>
  </Table.Body>
</Table>
```

---

## IMPLEMENTATION PHASES

### Phase 1: Foundation (Week 1)
- [ ] Next.js project setup
- [ ] PostgreSQL schema + migrations
- [ ] NextAuth configuration
- [ ] File storage (Railway volumes)
- [ ] Design system (Tailwind + tokens)
- [ ] Layout component (sidebars, top bar)

### Phase 2: Core Features (Week 2)
- [ ] Email integration (Gmail API)
- [ ] Company database + CRUD
- [ ] Email client (inbox, compose, threading)
- [ ] Company detail modal with editing
- [ ] Audit trail logging

### Phase 3: Agent System (Week 3)
- [ ] Task queue + creation
- [ ] Orchestrator loop (Claude API)
- [ ] Sub-agent dispatching (OpenRouter)
- [ ] Work log streaming (SSE)
- [ ] File storage integration
- [ ] Real-time updates (PostgreSQL LISTEN/NOTIFY)

### Phase 4: Polish (Week 4)
- [ ] AI reply suggestions (email)
- [ ] Admin panel (user management)
- [ ] CSV import/export (companies)
- [ ] Testing + bug fixes
- [ ] Railway deployment
- [ ] Production hardening

---

## TESTING REQUIREMENTS

**Unit Tests:**
- API routes (tasks, companies, emails)
- Utilities (fileStorage, orchestrator)

**Integration Tests:**
- Email sync flow
- Task creation → orchestrator → work log
- Company edit → audit trail

**E2E Tests:**
- Create task → view work log
- Send email → auto-link to company
- Edit company → audit trail visible

---

## DEPLOYMENT (RAILWAY)

**railway.json:**
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

**Build & Deploy:**
```bash
npm run build
railway up
```

---

## START BUILDING

Build this as ONE unified platform. NOT separate modules.

All pages use same design system.
All components from same library.
All data flows through single PostgreSQL.
All real-time via PostgreSQL LISTEN/NOTIFY.

Use UI/UX Pro Max Skill for design consistency.
Use Caveman mode for all communication.

Ready? Start with Phase 1 foundation.
