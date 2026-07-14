import type { ReactNode } from "react";

interface EmptyStateProps {
  children: ReactNode;
}

export function EmptyState({ children }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-secondary">
      {children}
    </div>
  );
}
