import { NextResponse } from "next/server";
import { auth, isCurrentAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db";
import type { User, UserRole } from "@/lib/types";

const VALID_ROLES: UserRole[] = ["admin", "member", "viewer"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isCurrentAdmin(session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const role = body?.role;
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const { rows: targetRows } = await client.query<User>(
      `SELECT * FROM users WHERE id = $1 AND org_id = $2 FOR UPDATE`,
      [id, session.user.orgId],
    );
    const target = targetRows[0];
    if (!target) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // The invariant is "this org must always have at least one admin" — it
    // doesn't matter whether the admin being demoted is the caller or
    // someone else. Locking the admin rows for the duration of the check +
    // update also closes the race where two admins concurrently demote two
    // different admins, each individually leaving 1 behind but together
    // leaving 0.
    if (role !== "admin" && target.role === "admin") {
      // FOR UPDATE can't be combined with an aggregate (count(*)) — lock the
      // admin rows directly and count them in JS instead.
      const { rows: adminRows } = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE org_id = $1 AND role = 'admin' FOR UPDATE`,
        [session.user.orgId],
      );
      if (adminRows.length <= 1) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Cannot remove the org's only admin" }, { status: 400 });
      }
    }

    const { rows } = await client.query<User>(
      `UPDATE users SET role = $1, updated_at = now() WHERE id = $2 AND org_id = $3 RETURNING *`,
      [role, id, session.user.orgId],
    );

    await client.query("COMMIT");
    return NextResponse.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
