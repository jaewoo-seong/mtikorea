import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import type { User, UserRole } from "@/lib/types";

const VALID_ROLES: UserRole[] = ["admin", "member", "viewer"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const role = body?.role;
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const { rows: targetRows } = await query<User>(`SELECT * FROM users WHERE id = $1 AND org_id = $2`, [
    id,
    session.user.orgId,
  ]);
  const target = targetRows[0];
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (target.id === session.user.id && role !== "admin") {
    const { rows: adminRows } = await query<{ count: string }>(
      `SELECT count(*) FROM users WHERE org_id = $1 AND role = 'admin'`,
      [session.user.orgId],
    );
    if (Number(adminRows[0].count) <= 1) {
      return NextResponse.json({ error: "Cannot demote the only admin" }, { status: 400 });
    }
  }

  const { rows } = await query<User>(
    `UPDATE users SET role = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [role, id],
  );

  return NextResponse.json(rows[0]);
}
