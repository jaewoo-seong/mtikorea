import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { emailBodyPath, findCompanyIdByAddress } from "@/lib/emails";
import { writeStorageFile } from "@/lib/fileStorage";
import type { Email } from "@/lib/types";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const folder = searchParams.get("folder");
  const direction = folder === "sent" ? "sent" : folder === "inbox" ? "received" : null;

  const { rows } = await query<Email>(
    direction
      ? `SELECT * FROM emails WHERE org_id = $1 AND direction = $2 ORDER BY COALESCE(received_at, sent_at, created_at) DESC`
      : `SELECT * FROM emails WHERE org_id = $1 ORDER BY COALESCE(received_at, sent_at, created_at) DESC`,
    direction ? [session.user.orgId, direction] : [session.user.orgId],
  );

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const content = typeof body?.body === "string" ? body.body : "";
  if (!to || !content.trim()) {
    return NextResponse.json({ error: "to and body are required" }, { status: 400 });
  }

  const fromAddress = session.user.email ?? "";
  const companyId =
    typeof body?.company_id === "string" && body.company_id
      ? body.company_id
      : await findCompanyIdByAddress(session.user.orgId, to);

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const { rows: threadRows } = await client.query<{ id: string }>(
      `INSERT INTO email_threads (org_id, company_id, subject, participant_emails)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [session.user.orgId, companyId, subject, [fromAddress, to]],
    );
    const threadId = threadRows[0].id;

    const { rows: emailRows } = await client.query<Email>(
      `INSERT INTO emails (org_id, company_id, thread_id, from_address, to_address, subject, direction, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'sent', now())
       RETURNING *`,
      [session.user.orgId, companyId, threadId, fromAddress, to, subject],
    );
    const email = emailRows[0];

    await client.query(`UPDATE email_threads SET last_email_id = $1, updated_at = now() WHERE id = $2`, [
      email.id,
      threadId,
    ]);

    await client.query("COMMIT");

    await writeStorageFile(emailBodyPath(session.user.orgId, email.id), content);

    return NextResponse.json(email, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
