export type UserRole = "admin" | "member" | "viewer";
export type CompanyStatus = "prospect" | "lead" | "customer" | "inactive";
export type TaskStatus = "queued" | "running" | "paused" | "completed" | "failed";
export type EmailDirection = "sent" | "received";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  global_context: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  org_id: string | null;
  role: UserRole;
  oauth_id: string | null;
  oauth_provider: string | null;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  org_id: string | null;
  name: string;
  korean_name: string | null;
  industry: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  status: CompanyStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyEdit {
  id: string;
  company_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  edited_by: string | null;
  edited_at: string;
}

export interface Email {
  id: string;
  org_id: string | null;
  company_id: string | null;
  from_address: string | null;
  to_address: string | null;
  cc: string[] | null;
  subject: string | null;
  body_file_path: string | null;
  gmail_message_id: string | null;
  direction: EmailDirection | null;
  read: boolean;
  flagged: boolean;
  created_at: string;
  received_at: string | null;
  sent_at: string | null;
}

export interface EmailThread {
  id: string;
  org_id: string | null;
  company_id: string | null;
  subject: string | null;
  last_email_id: string | null;
  participant_emails: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface AgentTask {
  id: string;
  org_id: string | null;
  company_id: string | null;
  title: string;
  description: string | null;
  global_context: Record<string, unknown> | null;
  task_context: Record<string, unknown> | null;
  task_checkpoint: Record<string, unknown> | null;
  status: TaskStatus;
  priority: string;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  token_budget: number;
  tokens_used: number;
  estimated_cost: number;
}

export interface AgentWorkLogEntry {
  id: string;
  task_id: string;
  step_number: number | null;
  phase: "orchestration" | "sub_agent_call" | "synthesis" | null;
  action: string | null;
  sub_agent_used: string | null;
  prompt_sent: string | null;
  response_file_path: string | null;
  duration_ms: number | null;
  tokens_used: number | null;
  cost_cents: number | null;
  accuracy_score: number | null;
  created_at: string;
}
