import { Card } from "@/components/common/Card";
import type { AgentTask, TaskStatus } from "@/lib/types";

interface TaskStatsProps {
  tasks: AgentTask[];
}

const STAT_ORDER: { status: TaskStatus; label: string; colorClass: string }[] = [
  { status: "running", label: "Running", colorClass: "text-status-running" },
  { status: "queued", label: "Queued", colorClass: "text-status-queued" },
  { status: "paused", label: "Paused", colorClass: "text-status-paused" },
  { status: "completed", label: "Completed", colorClass: "text-status-completed" },
  { status: "failed", label: "Failed", colorClass: "text-status-failed" },
];

export function TaskStats({ tasks }: TaskStatsProps) {
  const counts = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {STAT_ORDER.map(({ status, label, colorClass }) => (
        <Card key={status} variant="outline" className="p-3 text-center">
          <p className={`text-2xl font-bold ${colorClass}`}>{counts[status] ?? 0}</p>
          <p className="text-xs text-text-secondary">{label}</p>
        </Card>
      ))}
    </div>
  );
}
