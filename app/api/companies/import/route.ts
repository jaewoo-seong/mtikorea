import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { parseCsv } from "@/lib/utils";
import type { Company, CompanyStatus } from "@/lib/types";

const VALID_STATUSES: CompanyStatus[] = ["prospect", "lead", "customer", "inactive"];
const EXPECTED_HEADERS = [
  "name",
  "korean_name",
  "industry",
  "website",
  "email",
  "phone",
  "status",
  "notes",
];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const csv = typeof body?.csv === "string" ? body.csv : "";
  if (!csv.trim()) {
    return NextResponse.json({ error: "csv is required" }, { status: 400 });
  }

  const rows = parseCsv(csv);
  if (rows.length < 2) {
    return NextResponse.json({ error: "CSV needs a header row plus at least one data row" }, {
      status: 400,
    });
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("name");
  if (nameIdx === -1) {
    return NextResponse.json({ error: "CSV must include a 'name' column" }, { status: 400 });
  }

  const colIdx = (col: string) => header.indexOf(col);
  const imported: Company[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const name = cells[nameIdx]?.trim();
    if (!name) {
      errors.push({ row: i + 1, error: "missing name" });
      continue;
    }

    const get = (col: string) => {
      const idx = colIdx(col);
      const v = idx >= 0 ? cells[idx]?.trim() : "";
      return v ? v : null;
    };

    let status = get("status") ?? "prospect";
    if (!VALID_STATUSES.includes(status as CompanyStatus)) {
      status = "prospect";
    }

    try {
      const { rows: upserted } = await query<Company>(
        `INSERT INTO companies (org_id, name, korean_name, industry, website, email, phone, status, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (org_id, name) DO UPDATE SET
           korean_name = EXCLUDED.korean_name,
           industry = EXCLUDED.industry,
           website = EXCLUDED.website,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           status = EXCLUDED.status,
           notes = EXCLUDED.notes,
           updated_at = now()
         RETURNING *`,
        [
          session.user.orgId,
          name,
          get("korean_name"),
          get("industry"),
          get("website"),
          get("email"),
          get("phone"),
          status,
          get("notes"),
          session.user.id,
        ],
      );
      imported.push(upserted[0]);
    } catch (err) {
      errors.push({ row: i + 1, error: err instanceof Error ? err.message : "unknown error" });
    }
  }

  return NextResponse.json({ imported: imported.length, errors, expectedHeaders: EXPECTED_HEADERS });
}
