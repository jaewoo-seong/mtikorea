import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Stub: real Gmail sync needs GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET, a
// connected email_accounts row, and MIME parsing — none of which exist yet.
// Returning a clear "not configured" response rather than pretending to sync.
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    { error: "Gmail sync not configured. Set GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET and connect an account first." },
    { status: 501 },
  );
}
