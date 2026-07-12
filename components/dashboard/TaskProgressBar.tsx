import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/types";

interface TaskProgressBarProps {
  status: TaskStatus;
  tokensUsed: number;
  tokenBudget: number;
}

const barColorByStatus: Record<TaskStatus, string> = {
  queued: "bg-status-queued",
  running: "bg-status-running",
  paused: "bg-status-paused",
  completed: "bg-status-completed",
  failed: "bg-status-failed",
};

export function TaskProgressBar({ status, tokensUsed, tokenBudget }: TaskProgressBarProps) {
  const percent =
    status === "completed"
      ? 100
      : Math.min(100, Math.round((tokensUsed / Math.max(tokenBudget, 1)) * 100));

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-150",
            barColorByStatus[status],
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-text-secondary">
        {percent}%
      </span>
    </div>
  );
}
