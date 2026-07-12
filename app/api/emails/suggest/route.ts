import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { emailBodyPath } from "@/lib/emails";
import { readStorageFile } from "@/lib/fileStorage";
import type { Email } from "@/lib/types";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI reply suggestions need ANTHROPIC_API_KEY to be configured." },
      { status: 501 },
    );
  }

  const body = await request.json().catch(() => null);
  const emailId = typeof body?.emailId === "string" ? body.emailId : "";
  if (!emailId) {
    return NextResponse.json({ error: "emailId is required" }, { status: 400 });
  }

  const { rows } = await query<Email>(`SELECT * FROM emails WHERE id = $1 AND org_id = $2`, [
    emailId,
    session.user.orgId,
  ]);
  const email = rows[0];
  if (!email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const originalBody = await readStorageFile(emailBodyPath(session.user.orgId, email.id)).catch(() => "");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `Draft a brief, professional reply to this email. Only output the reply body text.\n\nSubject: ${email.subject ?? ""}\nFrom: ${email.from_address ?? ""}\n\n${originalBody}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return NextResponse.json({ error: `Claude API error: ${response.status} ${detail}` }, { status: 502 });
  }

  const data = await response.json();
  const suggestion = data.content?.[0]?.text ?? "";

  return NextResponse.json({ suggestion });
}
