import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { COMPANY_STATUSES } from "@/lib/constants";
import { query } from "@/lib/db";
import { parseCsv } from "@/lib/utils";
import type { Company, CompanyStatus } from "@/lib/types";

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

  interface ParsedRow {
    rowNum: number;
    name: string;
    korean_name: string | null;
    industry: string | null;
    website: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    notes: string | null;
  }

  const parsed: ParsedRow[] = [];
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
    if (!COMPANY_STATUSES.includes(status as CompanyStatus)) {
      status = "prospect";
    }

    parsed.push({
      rowNum: i + 1,
      name,
      korean_name: get("korean_name"),
      industry: get("industry"),
      website: get("website"),
      email: get("email"),
      phone: get("phone"),
      status,
      notes: get("notes"),
    });
  }

  // A multi-row INSERT ... ON CONFLICT DO UPDATE errors if the same conflict
  // target (org_id, name) appears twice in one statement, so dedupe within
  // this file first — last occurrence wins, earlier duplicates are reported.
  const byName = new Map<string, ParsedRow>();
  for (const r of parsed) {
    if (byName.has(r.name)) {
      errors.push({ row: byName.get(r.name)!.rowNum, error: `duplicate name "${r.name}" in file` });
    }
    byName.set(r.name, r);
  }
  const deduped = [...byName.values()];

  if (deduped.length > 0) {
    const valuePlaceholders: string[] = [];
    const params: unknown[] = [];
    for (const r of deduped) {
      const base = params.length;
      valuePlaceholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`,
      );
      params.push(
        session.user.orgId,
        r.name,
        r.korean_name,
        r.industry,
        r.website,
        r.email,
        r.phone,
        r.status,
        r.notes,
        session.user.id,
      );
    }

    try {
      const { rows: upserted } = await query<Company>(
        `INSERT INTO companies (org_id, name, korean_name, industry, website, email, phone, status, notes, created_by)
         VALUES ${valuePlaceholders.join(", ")}
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
        params,
      );
      imported.push(...upserted);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      for (const r of deduped) {
        errors.push({ row: r.rowNum, error: message });
      }
    }
  }

  return NextResponse.json({ imported: imported.length, errors, expectedHeaders: EXPECTED_HEADERS });
}
