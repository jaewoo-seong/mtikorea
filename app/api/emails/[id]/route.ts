import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { emailBodyPath } from "@/lib/emails";
import { readStorageFile } from "@/lib/fileStorage";
import type { Email, EmailInternalNote, EmailThread, EmailWithBody } from "@/lib/types";

async function withBody(orgId: string, email: Email): Promise<EmailWithBody> {
  try {
    const body = await readStorageFile(emailBodyPath(orgId, email.id));
    return { ...email, body };
  } catch {
    return email;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { rows } = await query<Email>(`SELECT * FROM emails WHERE id = $1 AND org_id = $2`, [
    id,
    session.user.orgId,
  ]);
  const email = rows[0];
  if (!email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Mark as read on open (only meaningful for received mail).
  if (email.direction === "received" && !email.read) {
    await query(`UPDATE emails SET read = true WHERE id = $1`, [id]);
    email.read = true;
  }

  const [thread, threadEmailsRaw, notes] = await Promise.all([
    email.thread_id
      ? query<EmailThread>(`SELECT * FROM email_threads WHERE id = $1`, [email.thread_id]).then(
          (r) => r.rows[0] ?? null,
        )
      : Promise.resolve(null),
    email.thread_id
      ? query<Email>(`SELECT * FROM emails WHERE thread_id = $1 ORDER BY created_at ASC`, [
          email.thread_id,
        ]).then((r) => r.rows)
      : Promise.resolve([email]),
    query<EmailInternalNote>(`SELECT * FROM email_internal_notes WHERE email_id = $1 ORDER BY created_at ASC`, [
      id,
    ]).then((r) => r.rows),
  ]);

  const threadEmails = await Promise.all(threadEmailsRaw.map((e) => withBody(session.user.orgId, e)));
  const emailWithBody = threadEmails.find((e) => e.id === email.id) ?? (await withBody(session.user.orgId, email));

  return NextResponse.json({
    ...emailWithBody,
    thread,
    thread_emails: threadEmails,
    notes,
  });
}
