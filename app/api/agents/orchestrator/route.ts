import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { claimNextQueuedTask, runTask } from "@/lib/orchestrator";
import type { AgentTask } from "@/lib/types";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const taskId = typeof body?.task_id === "string" ? body.task_id : null;

  let task: AgentTask | null;

  if (taskId) {
    const { rows } = await query<AgentTask>(
      `UPDATE agent_tasks SET status = 'running', started_at = now()
       WHERE id = $1 AND org_id = $2 AND status IN ('queued', 'failed')
       RETURNING *`,
      [taskId, session.user.orgId],
    );
    task = rows[0] ?? null;
    if (!task) {
      return NextResponse.json(
        { error: "Task not found, not in this org, or not queued/failed" },
        { status: 404 },
      );
    }
  } else {
    task = await claimNextQueuedTask(session.user.orgId);
    if (!task) {
      return NextResponse.json({ error: "No queued tasks in this org" }, { status: 404 });
    }
  }

  const finalTask = await runTask(task);
  if (finalTask) {
    return NextResponse.json(finalTask);
  }

  // runTask only returns null in the rare case its own failure-recording
  // UPDATE also failed — fall back to a fresh read so the caller still gets
  // the task's real current state instead of a broken response.
  const { rows: finalRows } = await query<AgentTask>(`SELECT * FROM agent_tasks WHERE id = $1`, [task.id]);
  return NextResponse.json(finalRows[0]);
}
