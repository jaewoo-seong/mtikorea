"use client";

import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { LoadingBlock } from "@/components/common/LoadingBlock";
import { TaskProgressBar } from "@/components/dashboard/TaskProgressBar";
import { WorkLog } from "@/components/dashboard/WorkLog";
import { useTask, useTaskLogs, useUpdateTask } from "@/lib/hooks";
import { formatDateTime } from "@/lib/utils";

export function TaskDetailPanel({ taskId }: { taskId: string }) {
  const { data: task, isLoading } = useTask(taskId);
  const { data: logs = [], isLoading: logsLoading } = useTaskLogs(taskId, task?.status);
  const updateTask = useUpdateTask();

  if (isLoading || !task) {
    return <LoadingBlock />;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Badge status={task.status}>{task.status}</Badge>
          <span className="text-xs text-text-secondary">{task.priority} priority</span>
        </div>
        <h3 className="text-base font-semibold text-text">{task.title}</h3>
        {task.description && <p className="mt-1 text-sm text-text-secondary">{task.description}</p>}
      </div>

      <TaskProgressBar status={task.status} tokensUsed={task.tokens_used} tokenBudget={task.token_budget} />

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-text-secondary">Created</dt>
        <dd className="text-text">{formatDateTime(task.created_at)}</dd>
        {task.started_at && (
          <>
            <dt className="text-text-secondary">Started</dt>
            <dd className="text-text">{formatDateTime(task.started_at)}</dd>
          </>
        )}
        {task.completed_at && (
          <>
            <dt className="text-text-secondary">Completed</dt>
            <dd className="text-text">{formatDateTime(task.completed_at)}</dd>
          </>
        )}
        <dt className="text-text-secondary">Tokens</dt>
        <dd className="text-text">
          {task.tokens_used} / {task.token_budget}
        </dd>
        <dt className="text-text-secondary">Est. cost</dt>
        <dd className="text-text">${Number(task.estimated_cost).toFixed(2)}</dd>
      </dl>

      {(task.status === "running" || task.status === "paused") && (
        <Button
          size="sm"
          variant="secondary"
          disabled={updateTask.isPending}
          onClick={() =>
            updateTask.mutate({ id: task.id, status: task.status === "running" ? "paused" : "running" })
          }
        >
          {task.status === "running" ? "Pause" : "Resume"}
        </Button>
      )}

      <div>
        <h4 className="mb-2 text-sm font-semibold text-text">Work Log</h4>
        <WorkLog entries={logs} isLoading={logsLoading} emptyLabel="No work log entries yet." />
      </div>
    </div>
  );
}
