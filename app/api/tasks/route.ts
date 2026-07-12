import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import type { AgentTask, TaskStatus } from "@/lib/types";

const VALID_STATUSES: TaskStatus[] = ["queued", "running", "paused", "completed", "failed"];

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  if (status && !VALID_STATUSES.includes(status as TaskStatus)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const { rows } = await query<AgentTask>(
    status
      ? `SELECT * FROM agent_tasks WHERE org_id = $1 AND status = $2 ORDER BY created_at DESC`
      : `SELECT * FROM agent_tasks WHERE org_id = $1 ORDER BY created_at DESC`,
    status ? [session.user.orgId, status] : [session.user.orgId],
  );

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const description = typeof body?.description === "string" ? body.description.trim() : null;
  const priority = typeof body?.priority === "string" ? body.priority : "normal";

  let companyId: string | null = null;
  if (typeof body?.company_id === "string" && body.company_id) {
    const { rows: companyRows } = await query(`SELECT id FROM companies WHERE id = $1 AND org_id = $2`, [
      body.company_id,
      session.user.orgId,
    ]);
    if (companyRows.length === 0) {
      return NextResponse.json({ error: "Invalid company_id" }, { status: 400 });
    }
    companyId = body.company_id;
  }

  const { rows } = await query<AgentTask>(
    `INSERT INTO agent_tasks (org_id, company_id, title, description, priority, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [session.user.orgId, companyId, title, description, priority, session.user.id],
  );

  return NextResponse.json(rows[0], { status: 201 });
}
