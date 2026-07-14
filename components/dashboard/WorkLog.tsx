import { EmptyState } from "@/components/common/EmptyState";
import { LoadingBlock } from "@/components/common/LoadingBlock";
import { WorkLogEntry } from "@/components/dashboard/WorkLogEntry";
import type { AgentWorkLogEntryWithResponse } from "@/lib/types";

interface WorkLogProps {
  entries: AgentWorkLogEntryWithResponse[];
  isLoading?: boolean;
  emptyLabel?: string;
}

export function WorkLog({ entries, isLoading, emptyLabel = "No activity yet." }: WorkLogProps) {
  if (isLoading) {
    return <LoadingBlock />;
  }

  if (entries.length === 0) {
    return <EmptyState>{emptyLabel}</EmptyState>;
  }

  return (
    <ul className="space-y-1">
      {entries.map((entry) => (
        <WorkLogEntry key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}
