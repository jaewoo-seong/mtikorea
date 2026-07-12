"use client";

import { useState } from "react";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { CreateTaskModal } from "@/components/dashboard/CreateTaskModal";
import { TaskDetailPanel } from "@/components/dashboard/TaskDetailPanel";
import { TaskQueue } from "@/components/dashboard/TaskQueue";
import { TaskStats } from "@/components/dashboard/TaskStats";
import { useTaskSubscription } from "@/lib/hooks";

export default function DashboardPage() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: tasks = [], isLoading } = useTaskSubscription();

  return (
    <>
      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        <h1 className="mb-4 text-xl font-bold text-text">Dashboard</h1>

        <div className="mb-6">
          <TaskStats tasks={tasks} />
        </div>

        <TaskQueue
          tasks={tasks}
          isLoading={isLoading}
          selectedTaskId={selectedTaskId}
          onSelect={setSelectedTaskId}
          onCreateClick={() => setCreateOpen(true)}
        />
      </div>

      {selectedTaskId && (
        <RightSidebar title="Task Details">
          <TaskDetailPanel taskId={selectedTaskId} />
        </RightSidebar>
      )}

      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => setSelectedTaskId(id)}
      />
    </>
  );
}
