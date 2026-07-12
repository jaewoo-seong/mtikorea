import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import type { Company, CompanyStatus } from "@/lib/types";

const VALID_STATUSES: CompanyStatus[] = ["prospect", "lead", "customer", "inactive"];

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const industry = searchParams.get("industry");
  const q = searchParams.get("q");

  if (status && !VALID_STATUSES.includes(status as CompanyStatus)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const conditions = ["org_id = $1"];
  const params: unknown[] = [session.user.orgId];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (industry) {
    params.push(`%${industry}%`);
    conditions.push(`industry ILIKE $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(name ILIKE $${params.length} OR korean_name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }

  const { rows } = await query<Company>(
    `SELECT * FROM companies WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    params,
  );

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const status = typeof body?.status === "string" ? body.status : "prospect";
  if (!VALID_STATUSES.includes(status as CompanyStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  try {
    const { rows } = await query<Company>(
      `INSERT INTO companies (org_id, name, korean_name, industry, website, email, phone, status, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        session.user.orgId,
        name,
        strOrNull(body?.korean_name),
        strOrNull(body?.industry),
        strOrNull(body?.website),
        strOrNull(body?.email),
        strOrNull(body?.phone),
        status,
        strOrNull(body?.notes),
        session.user.id,
      ],
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "23505") {
      return NextResponse.json({ error: "A company with this name already exists" }, { status: 409 });
    }
    throw err;
  }
}
