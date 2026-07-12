"use client";

import { useQuery } from "@tanstack/react-query";
import type { AgentTask, Company, Email } from "@/lib/types";

// Placeholder signatures — real implementations (SSE subscriptions, mutations)
// land with the dashboard/email/database build phases once the corresponding
// API routes exist.

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function useTaskSubscription() {
  return useQuery<AgentTask[]>({
    queryKey: ["tasks"],
    queryFn: () => fetchJson<AgentTask[]>("/api/tasks"),
    enabled: false,
  });
}

export function useCompanies() {
  return useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => fetchJson<Company[]>("/api/companies"),
    enabled: false,
  });
}

export function useEmails() {
  return useQuery<Email[]>({
    queryKey: ["emails"],
    queryFn: () => fetchJson<Email[]>("/api/emails"),
    enabled: false,
  });
}
