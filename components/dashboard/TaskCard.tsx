import { Badge } from "@/components/common/Badge";
import { TaskProgressBar } from "@/components/dashboard/TaskProgressBar";
import { cn, formatDateTime, truncate } from "@/lib/utils";
import type { AgentTask } from "@/lib/types";

interface TaskCardProps {
  task: AgentTask;
  selected?: boolean;
  onClick?: () => void;
}

export function TaskCard({ task, selected, onClick }: TaskCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors duration-150",
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-surface hover:border-primary/40",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">{task.title}</h3>
        <Badge status={task.status}>{task.status}</Badge>
      </div>
      {task.description && (
        <p className="mb-2 text-xs text-text-secondary">{truncate(task.description, 90)}</p>
      )}
      <TaskProgressBar status={task.status} tokensUsed={task.tokens_used} tokenBudget={task.token_budget} />
      <p className="mt-2 text-xs text-text-secondary">Created {formatDateTime(task.created_at)}</p>
    </button>
  );
}
