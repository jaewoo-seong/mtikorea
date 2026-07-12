"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AgentTask,
  AgentWorkLogEntryWithResponse,
  Company,
  CompanyEdit,
  CompanyStatus,
  CompanyWithLinks,
  Email,
  EmailDetail,
  EmailInternalNote,
  Organization,
  TaskStatus,
  User,
  UserRole,
} from "@/lib/types";

const RUNNING_POLL_MS = 3000;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

function hasRunningTask(tasks: AgentTask[] | undefined) {
  return (tasks ?? []).some((t) => t.status === "running");
}

export function useTaskSubscription() {
  return useQuery<AgentTask[]>({
    queryKey: ["tasks"],
    queryFn: () => fetchJson<AgentTask[]>("/api/tasks"),
    refetchInterval: (query) => (hasRunningTask(query.state.data) ? RUNNING_POLL_MS : false),
  });
}

export function useTask(taskId: string | null) {
  return useQuery<AgentTask>({
    queryKey: ["task", taskId],
    queryFn: () => fetchJson<AgentTask>(`/api/tasks/${taskId}`),
    enabled: !!taskId,
    refetchInterval: (query) => (query.state.data?.status === "running" ? RUNNING_POLL_MS : false),
  });
}

export function useTaskLogs(taskId: string | null, status?: TaskStatus) {
  return useQuery<AgentWorkLogEntryWithResponse[]>({
    queryKey: ["task", taskId, "logs"],
    queryFn: () => fetchJson<AgentWorkLogEntryWithResponse[]>(`/api/tasks/${taskId}/logs`),
    enabled: !!taskId,
    refetchInterval: status === "running" ? RUNNING_POLL_MS : false,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      description?: string;
      priority?: string;
      company_id?: string;
    }) =>
      fetchJson<AgentTask>("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; status?: TaskStatus }) =>
      fetchJson<AgentTask>(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", variables.id] });
    },
  });
}

interface CompanyFilters {
  status?: CompanyStatus | "";
  industry?: string;
  q?: string;
}

function companiesUrl(filters?: CompanyFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.industry) params.set("industry", filters.industry);
  if (filters?.q) params.set("q", filters.q);
  const qs = params.toString();
  return qs ? `/api/companies?${qs}` : "/api/companies";
}

export function useCompanies(filters?: CompanyFilters) {
  return useQuery<Company[]>({
    queryKey: ["companies", filters ?? {}],
    queryFn: () => fetchJson<Company[]>(companiesUrl(filters)),
  });
}

export function useCompany(companyId: string | null) {
  return useQuery<CompanyWithLinks>({
    queryKey: ["company", companyId],
    queryFn: () => fetchJson<CompanyWithLinks>(`/api/companies/${companyId}`),
    enabled: !!companyId,
  });
}

export function useCompanyEdits(companyId: string | null) {
  return useQuery<CompanyEdit[]>({
    queryKey: ["company", companyId, "edits"],
    queryFn: () => fetchJson<CompanyEdit[]>(`/api/companies/${companyId}/edits`),
    enabled: !!companyId,
  });
}

type CompanyInput = Partial<
  Pick<
    Company,
    "name" | "korean_name" | "industry" | "website" | "email" | "phone" | "status" | "notes"
  >
>;

export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanyInput) =>
      fetchJson<Company>("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: CompanyInput & { id: string }) =>
      fetchJson<Company>(`/api/companies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["company", variables.id, "edits"] });
    },
  });
}

export function useDeleteCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/companies/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}

export function useImportCompaniesCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (csv: string) =>
      fetchJson<{ imported: number; errors: { row: number; error: string }[] }>(
        "/api/companies/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}

export function useEmails(folder?: "inbox" | "sent") {
  return useQuery<Email[]>({
    queryKey: ["emails", folder ?? "all"],
    queryFn: () => fetchJson<Email[]>(folder ? `/api/emails?folder=${folder}` : "/api/emails"),
  });
}

export function useEmail(emailId: string | null) {
  return useQuery<EmailDetail>({
    queryKey: ["email", emailId],
    queryFn: () => fetchJson<EmailDetail>(`/api/emails/${emailId}`),
    enabled: !!emailId,
  });
}

export function useSendEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { to: string; subject: string; body: string; company_id?: string }) =>
      fetchJson<Email>("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
  });
}

export function useReplyToEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      fetchJson<Email>(`/api/emails/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["email", variables.id] });
    },
  });
}

export function useAddInternalNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      fetchJson<EmailInternalNote>(`/api/emails/${id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["email", variables.id] });
    },
  });
}

export function useSuggestReply() {
  return useMutation({
    mutationFn: (emailId: string) =>
      fetchJson<{ suggestion: string }>("/api/emails/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      }),
  });
}

export function useAdminUsers() {
  return useQuery<User[]>({
    queryKey: ["admin", "users"],
    queryFn: () => fetchJson<User[]>("/api/admin/users"),
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      fetchJson<User>(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useOrganization() {
  return useQuery<Organization>({
    queryKey: ["admin", "organization"],
    queryFn: () => fetchJson<Organization>("/api/admin/organization"),
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      fetchJson<Organization>("/api/admin/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "organization"] });
    },
  });
}
