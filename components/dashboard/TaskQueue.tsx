import { Button } from "@/components/common/Button";
import { Icon } from "@/components/common/Icon";
import { Spinner } from "@/components/common/Spinner";
import { TaskCard } from "@/components/dashboard/TaskCard";
import type { AgentTask } from "@/lib/types";

interface TaskQueueProps {
  tasks: AgentTask[];
  isLoading: boolean;
  selectedTaskId: string | null;
  onSelect: (id: string) => void;
  onCreateClick: () => void;
}

export function TaskQueue({ tasks, isLoading, selectedTaskId, onSelect, onCreateClick }: TaskQueueProps) {
  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Task Queue</h2>
        <Button size="sm" onClick={onCreateClick}>
          <Icon name="plus" className="h-4 w-4" />
          New Task
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-secondary">
          No tasks yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              selected={task.id === selectedTaskId}
              onClick={() => onSelect(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
