-- ============ EXTENSIONS ============

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  access_token TEXT,
  refresh_token TEXT,
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
