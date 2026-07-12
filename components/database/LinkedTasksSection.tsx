import { Badge } from "@/components/common/Badge";
import { formatDateTime } from "@/lib/utils";
import type { AgentTask } from "@/lib/types";

export function LinkedTasksSection({ tasks }: { tasks: AgentTask[] }) {
  if (tasks.length === 0) {
    return <p className="text-sm text-text-secondary">No linked tasks yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center justify-between gap-2 rounded border border-border p-2 text-sm">
          <div>
            <p className="font-medium text-text">{task.title}</p>
            <p className="text-xs text-text-secondary">{formatDateTime(task.created_at)}</p>
          </div>
          <Badge status={task.status}>{task.status}</Badge>
        </li>
      ))}
    </ul>
  );
}
