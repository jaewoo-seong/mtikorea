import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { COMPANY_STATUSES } from "@/lib/constants";
import { getPool, query } from "@/lib/db";
import type { AgentTask, Company, Email } from "@/lib/types";

const EDITABLE_FIELDS = [
  "name",
  "korean_name",
  "industry",
  "website",
  "email",
  "phone",
  "status",
  "notes",
] as const;

async function getOwnedCompany(id: string, orgId: string) {
  const { rows } = await query<Company>(`SELECT * FROM companies WHERE id = $1 AND org_id = $2`, [
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
  const company = await getOwnedCompany(id, session.user.orgId);
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ rows: linkedEmails }, { rows: linkedTasks }] = await Promise.all([
    query<Email>(
      `SELECT * FROM emails WHERE company_id = $1 AND org_id = $2 ORDER BY created_at DESC LIMIT 20`,
      [id, session.user.orgId],
    ),
    query<AgentTask>(
      `SELECT * FROM agent_tasks WHERE company_id = $1 AND org_id = $2 ORDER BY created_at DESC LIMIT 20`,
      [id, session.user.orgId],
    ),
  ]);

  return NextResponse.json({ ...company, linked_emails: linkedEmails, linked_tasks: linkedTasks });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if ("status" in body && !COMPANY_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if ("name" in body && (typeof body.name !== "string" || !body.name.trim())) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const { rows: existingRows } = await client.query<Company>(
      `SELECT * FROM companies WHERE id = $1 AND org_id = $2 FOR UPDATE`,
      [id, session.user.orgId],
    );
    const existing = existingRows[0];
    if (!existing) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue;
      const newValue = typeof body[field] === "string" ? body[field].trim() || null : null;
      const oldValue = existing[field];
      if (newValue !== oldValue) {
        changes.push({ field, oldValue, newValue });
      }
    }

    if (changes.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(existing);
    }

    const setClause = changes.map((c, i) => `${c.field} = $${i + 1}`).join(", ");
    const { rows: updatedRows } = await client.query<Company>(
      `UPDATE companies SET ${setClause}, updated_at = now() WHERE id = $${changes.length + 1} RETURNING *`,
      [...changes.map((c) => c.newValue), id],
    );

    for (const change of changes) {
      await client.query(
        `INSERT INTO company_edits (company_id, field_name, old_value, new_value, edited_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, change.field, change.oldValue, change.newValue, session.user.id],
      );
    }

    await client.query("COMMIT");
    return NextResponse.json(updatedRows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const { rowCount } = await query(`DELETE FROM companies WHERE id = $1 AND org_id = $2`, [
      id,
      session.user.orgId,
    ]);
    if (rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23503") {
      return NextResponse.json(
        { error: "Cannot delete company: it still has linked records" },
        { status: 409 },
      );
    }
    throw err;
  }
}
