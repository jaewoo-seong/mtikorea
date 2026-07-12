# Claude Code - MTI AI Platform Setup & Skill Usage

## IMMEDIATE STARTUP (RUN FIRST)

When starting Claude Code for this project:

```bash
# 1. Clone skills
git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git ./skills/ui-ux-pro-max
git clone https://github.com/JuliusBrussee/caveman.git ./skills/caveman

# 2. Install dependencies
npm install --prefix ./skills/ui-ux-pro-max
npm install --prefix ./skills/caveman

# 3. Load skills into this terminal session
source ./skills/ui-ux-pro-max/index.js
source ./skills/caveman/index.js

# 4. Verify skills loaded
echo "Skills initialized. Ready to build."
```

---

## CAVEMAN MODE - HOW IT WORKS

**Caveman mode simplifies communication to 75% fewer tokens.**

Usage pattern:
```bash
# All Claude responses from now on use Caveman
caveman mode: full
```

**In practice:**
- Long explanations → bullet points
- Full sentences → fragments
- Code comments → minimal
- Output → concise, dense

**Example:**
```
BEFORE: "I'm going to create a new component that handles user authentication..."
AFTER: "Create auth component. NextAuth config. OAuth flow. Done."
```

**You receive:**
- Same technical accuracy
- 75% less text
- Faster execution
- Clearer structure

---

## UI/UX PRO MAX SKILL - HOW IT WORKS

**Auto-applies design system to all components.**

Usage pattern:
```bash
# All components use UI/UX Pro Max during generation
ui-ux mode: pro-max
```

**What it provides:**
- Color palette (primary, accent, semantic)
- Typography scale (headings, body, mono)
- Spacing system (4px grid)
- Component patterns (buttons, cards, modals)
- Accessibility (WCAG AA baseline)
- Responsive breakpoints
- Animation tokens

**In practice:**
```tsx
// WITHOUT UI/UX Skill
<button className="bg-blue-500">Click</button>

// WITH UI/UX Skill (auto-generated)
<button className="
  bg-primary
  text-white
  px-4 py-2
  rounded-lg
  hover:bg-primary-600
  focus:ring-2 focus:ring-primary-300
  transition-colors
  font-semibold
  shadow-md
  disabled:opacity-50
">
  Click
</button>
```

The skill handles:
- Naming consistency (primary, secondary, ghost)
- Responsive scaling
- State variations (hover, focus, active, disabled)
- Dark mode support (if needed)
- Animation curves
- Spacing alignment

---

## WORKFLOW: BUILD ONE SECTION AT A TIME

### Section 1: Dashboard

**Steps:**
1. Prompt: "Build dashboard page (Phase 1). Use UI/UX Skill. Caveman mode."
2. Claude Code generates:
   - `/app/dashboard/page.tsx`
   - `/components/dashboard/*` (TaskQueue, WorkLog, etc)
   - `/lib/hooks.ts` (useTaskSubscription, etc)
3. You get: Complete, designed, accessible dashboard
4. All components styled consistently via UI/UX Skill

**Prompt template:**
```
Build dashboard component using UI/UX Pro Max Skill.
Caveman mode: full.

Features:
- Task queue panel
- Real-time work log
- Task detail sidebar
- Progress bars

Layout: flex, dashboard on left, details on right.
Colors: primary blue, success green, danger red.
Use UI/UX design tokens for all styling.
```

### Section 2: Email Client

**Prompt template:**
```
Build email client using UI/UX Pro Max Skill.
Caveman mode: full.

Features:
- Email list (inbox)
- Email detail (thread)
- Compose draft (reply)
- Company panel (right sidebar)
- Folder tree (left sidebar)

Reuse components from dashboard (buttons, modals, cards).
Maintain design consistency via UI/UX tokens.
```

### Section 3: Database Editor

**Prompt template:**
```
Build database editor using UI/UX Pro Max Skill.
Caveman mode: full.

Features:
- Companies table (editable cells)
- Company detail modal
- Filters (status, industry)
- Audit trail (edit history)

Reuse table components.
Editable cells: click to edit, blur to save.
Maintain design consistency via UI/UX tokens.
```

---

## DURING DEVELOPMENT: SKILL APPLICATION PATTERNS

**Every new component, prompt with skills:**

```bash
# Bad
"Create a button component"

# Good
"Create button component. Use UI/UX Pro Max.
Variants: primary, secondary, ghost.
States: default, hover, active, disabled.
Caveman mode: full."
```

**Every file generation, mention skills:**

```bash
# Bad
"Generate the TaskQueue component"

# Good
"Generate TaskQueue component.
Use UI/UX Pro Max Skill for styling.
Use shared design tokens (colors, spacing, shadows).
Caveman mode: full.
Match dashboard design system exactly."
```

**Every integration, reference design consistency:**

```bash
# Bad
"Connect email client to sidebar"

# Good
"Connect email client. Use existing LeftSidebar component.
Match dashboard styling exactly via UI/UX tokens.
Button styles consistent across app.
Caveman mode: full."
```

---

## REUSABLE COMPONENT CHECKLIST

Once created, reuse everywhere:

```
DESIGN SYSTEM (ONE TIME)
✓ Button.tsx (primary, secondary, ghost)
✓ Card.tsx (elevated, flat, outline)
✓ Modal.tsx (center, sidebar, fullscreen)
✓ Input.tsx (text, select, textarea, date)
✓ Table.tsx (rows, cells, editable)
✓ Badge.tsx (status colors)

DASHBOARD SPECIFIC
✓ TaskQueue.tsx
✓ WorkLog.tsx
✓ TaskDetailPanel.tsx

EMAIL SPECIFIC
✓ EmailList.tsx
✓ EmailDetail.tsx
✓ ComposeDraft.tsx
✓ CompanyPanel.tsx

DATABASE SPECIFIC
✓ CompaniesTable.tsx
✓ CompanyDetailModal.tsx
✓ EditableCell.tsx

LAYOUT SHARED
✓ AppLayout.tsx (used by all pages)
✓ LeftSidebar.tsx (used by all pages)
✓ TopBar.tsx (used by all pages)
✓ RightSidebar.tsx (context-dependent)
```

When building new section, reference existing components:

```
"Build email client. Reuse Button from dashboard.
Reuse Card from dashboard. Reuse Modal from dashboard.
Maintain exact same design via UI/UX tokens.
Caveman mode: full."
```

---

## CAVEMAN MODE OUTPUT EXAMPLES

### Dashboard Generation Output (Caveman)

```
✓ Created: app/dashboard/page.tsx
✓ Created: components/dashboard/TaskQueue.tsx
✓ Created: components/dashboard/WorkLog.tsx
✓ Created: components/dashboard/TaskDetailPanel.tsx

Features:
- Real-time task updates (SSE)
- Editable task details
- Inline progress bars
- Click-to-expand work log

Styling: UI/UX tokens (primary blue, success green)
Status: dashboard ready, connect to backend API next.

Next step: Build email client reusing Button/Card/Modal.
```

### API Route Generation Output (Caveman)

```
✓ Created: app/api/tasks/route.ts
✓ Created: app/api/tasks/[id]/route.ts
✓ Created: app/api/tasks/[id]/logs/route.ts

Features:
- GET/POST tasks
- PATCH/DELETE single task
- SSE stream for work log

DB: uses schema from MTI_AI_PLATFORM_BUILD_PROMPT
Auth: NextAuth middleware
Errors: proper HTTP codes

Next: Create companies API routes.
```

### Component Styling Output (Caveman)

```
✓ Button component generated

Classes applied:
- Base: bg-primary text-white rounded-lg
- Hover: bg-primary-600 shadow-md
- Focus: ring-2 ring-primary-300
- Disabled: opacity-50 cursor-not-allowed
- Size: px-4 py-2 text-sm (responsive up)

Variants: primary | secondary | ghost
All via UI/UX Pro Max tokens.
```

---

## COMMON PROMPTS (COPY & PASTE)

### "Create foundation"
```
Initialize MTI AI Platform.
Caveman mode: full.
Use UI/UX Pro Max Skill.

Tasks:
1. Setup Next.js 14+ (App Router, TypeScript)
2. Install Tailwind CSS + configure
3. Create layout structure (LeftSidebar, TopBar, RightSidebar)
4. Create design token CSS file (colors, typography, spacing)
5. Create Button, Card, Modal, Input base components
6. Create auth setup (NextAuth.js config)
7. Setup database client (Supabase JS)
8. Create file storage interface (Railway volumes)

Output: Foundation ready for dashboard build.
```

### "Build [section] page"
```
Build [dashboard/email/companies] section.
Caveman mode: full.
Use UI/UX Pro Max Skill.

Reference:
- Design: MTI_AI_PLATFORM_BUILD_PROMPT.md
- Component: Reuse existing Button/Card/Modal
- Styling: Match dashboard colors exactly
- Layout: Flex layout, responsive

Features:
[List features from prompt]

Output: Complete, styled, responsive page.
Next step: [What's next]
```

### "Connect API"
```
Connect [dashboard/email/companies] to backend.
Caveman mode: full.

Tasks:
1. Create React hooks (useTasks, useEmails, useCompanies)
2. Create API client (fetch wrapper)
3. Connect real-time updates (SSE or LISTEN/NOTIFY)
4. Add loading states
5. Add error handling
6. Add optimistic updates

Output: Full backend integration.
Test with: [How to test]
```

---

## SKILL DEACTIVATION (IF NEEDED)

```bash
# Disable Caveman
caveman mode: off

# Disable UI/UX
ui-ux mode: off

# Re-enable
caveman mode: full
ui-ux mode: pro-max
```

---

## FINAL CHECKLIST BEFORE CODING

- [ ] Skills cloned and installed
- [ ] Caveman mode: `full`
- [ ] UI/UX mode: `pro-max`
- [ ] Build prompt read: `MTI_AI_PLATFORM_BUILD_PROMPT.md`
- [ ] Phase 1 ready: Foundation components
- [ ] Database schema ready: PostgreSQL migrations
- [ ] Environment variables file: `.env.example` created
- [ ] GitHub repo initialized (if needed)
- [ ] Railway project created (if deploying)

---

## GO LIVE INSTRUCTION

When ready to start building:

```
I'm using:
- Caveman mode (full)
- UI/UX Pro Max Skill
- MTI_AI_PLATFORM_BUILD_PROMPT.md as specification
- Railway for deployment
- PostgreSQL for database
- Next.js App Router

Build Phase 1 foundation first.
Then dashboard.
Then email client.
Then database editor.

One unified system, one design language.

Start foundation build now.
```

---

**SKILLS ENABLED. READY TO BUILD.**
