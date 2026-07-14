import type { CompanyStatus, TaskStatus } from "@/lib/types";

export const COMPANY_STATUS_OPTIONS: { value: CompanyStatus; label: string }[] = [
  { value: "prospect", label: "Prospect" },
  { value: "lead", label: "Lead" },
  { value: "customer", label: "Customer" },
  { value: "inactive", label: "Inactive" },
];

export const COMPANY_STATUSES: CompanyStatus[] = COMPANY_STATUS_OPTIONS.map((o) => o.value);

export const TASK_STATUSES: TaskStatus[] = ["queued", "running", "paused", "completed", "failed"];
