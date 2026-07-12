import { Spinner } from "@/components/common/Spinner";
import { WorkLogEntry } from "@/components/dashboard/WorkLogEntry";
import type { AgentWorkLogEntryWithResponse } from "@/lib/types";

interface WorkLogProps {
  entries: AgentWorkLogEntryWithResponse[];
  isLoading?: boolean;
  emptyLabel?: string;
}

export function WorkLog({ entries, isLoading, emptyLabel = "No activity yet." }: WorkLogProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-secondary">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {entries.map((entry) => (
        <WorkLogEntry key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}
