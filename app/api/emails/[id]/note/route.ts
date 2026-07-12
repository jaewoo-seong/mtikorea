import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import type { Email, EmailInternalNote } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!note) {
    return NextResponse.json({ error: "note is required" }, { status: 400 });
  }

  const { rows: emailRows } = await query<Email>(`SELECT id FROM emails WHERE id = $1 AND org_id = $2`, [
    id,
    session.user.orgId,
  ]);
  if (emailRows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { rows } = await query<EmailInternalNote>(
    `INSERT INTO email_internal_notes (email_id, user_id, note) VALUES ($1, $2, $3) RETURNING *`,
    [id, session.user.id, note],
  );

  return NextResponse.json(rows[0], { status: 201 });
}
