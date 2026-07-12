import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import type { User } from "@/lib/types";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { rows } = await query<User>(`SELECT * FROM users WHERE org_id = $1 ORDER BY created_at ASC`, [
    session.user.orgId,
  ]);

  return NextResponse.json(rows);
}
