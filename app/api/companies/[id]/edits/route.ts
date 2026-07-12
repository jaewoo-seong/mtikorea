import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import type { Company, CompanyEdit } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { rows: companyRows } = await query<Company>(
    `SELECT id FROM companies WHERE id = $1 AND org_id = $2`,
    [id, session.user.orgId],
  );
  if (companyRows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { rows } = await query<CompanyEdit>(
    `SELECT * FROM company_edits WHERE company_id = $1 ORDER BY edited_at DESC`,
    [id],
  );

  return NextResponse.json(rows);
}
