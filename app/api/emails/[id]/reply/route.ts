import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { emailBodyPath } from "@/lib/emails";
import { deleteStorageFile, writeStorageFile } from "@/lib/fileStorage";
import type { Email } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const content = typeof body?.body === "string" ? body.body : "";
  if (!content.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const { rows } = await query<Email>(`SELECT * FROM emails WHERE id = $1 AND org_id = $2`, [
    id,
    session.user.orgId,
  ]);
  const original = rows[0];
  if (!original) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const fromAddress = session.user.email ?? "";
  const toAddress = original.direction === "sent" ? original.to_address : original.from_address;
  const subject = original.subject?.startsWith("Re:") ? original.subject : `Re: ${original.subject ?? ""}`;

  const replyId = randomUUID();
  const bodyPath = emailBodyPath(session.user.orgId, replyId);
  await writeStorageFile(bodyPath, content);

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const { rows: emailRows } = await client.query<Email>(
      `INSERT INTO emails (id, org_id, company_id, thread_id, from_address, to_address, subject, direction, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent', now())
       RETURNING *`,
      [replyId, session.user.orgId, original.company_id, original.thread_id, fromAddress, toAddress, subject],
    );
    const reply = emailRows[0];

    if (original.thread_id) {
      await client.query(`UPDATE email_threads SET last_email_id = $1, updated_at = now() WHERE id = $2`, [
        reply.id,
        original.thread_id,
      ]);
    }

    await client.query("COMMIT");

    return NextResponse.json(reply, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    await deleteStorageFile(bodyPath).catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
