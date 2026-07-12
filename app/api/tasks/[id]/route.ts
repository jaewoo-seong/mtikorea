import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import type { AgentTask, TaskStatus } from "@/lib/types";

const VALID_STATUSES: TaskStatus[] = ["queued", "running", "paused", "completed", "failed"];

async function getOwnedTask(id: string, orgId: string) {
  const { rows } = await query<AgentTask>(`SELECT * FROM agent_tasks WHERE id = $1 AND org_id = $2`, [
    id,
    orgId,
  ]);
  return rows[0] ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const task = await getOwnedTask(id, session.user.orgId);
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getOwnedTask(id, session.user.orgId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const nextStatus: TaskStatus | undefined = body.status;
  if (nextStatus && !VALID_STATUSES.includes(nextStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Status transitions stamp their own timestamp server-side rather than
  // trusting client-supplied dates.
  const statusTimestampColumn: Record<TaskStatus, string | null> = {
    queued: null,
    running: "started_at",
    paused: "paused_at",
    completed: "completed_at",
    failed: "completed_at",
  };

  const { rows } = await query<AgentTask>(
    `UPDATE agent_tasks SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       priority = COALESCE($3, priority),
       status = COALESCE($4, status),
       task_checkpoint = COALESCE($5, task_checkpoint),
       ${nextStatus && statusTimestampColumn[nextStatus] ? `${statusTimestampColumn[nextStatus]} = now(),` : ""}
       tokens_used = COALESCE($6, tokens_used)
     WHERE id = $7 AND org_id = $8
     RETURNING *`,
    [
      typeof body.title === "string" ? body.title.trim() : null,
      typeof body.description === "string" ? body.description : null,
      typeof body.priority === "string" ? body.priority : null,
      nextStatus ?? null,
      body.task_checkpoint ? JSON.stringify(body.task_checkpoint) : null,
      typeof body.tokens_used === "number" ? body.tokens_used : null,
      id,
      session.user.orgId,
    ],
  );

  return NextResponse.json(rows[0]);
}
