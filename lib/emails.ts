import { query } from "@/lib/db";

// Auto-link an email to a company by matching the counterparty address
// against companies.email — shared by compose and reply, both directions.
export async function findCompanyIdByAddress(orgId: string, address: string | null) {
  if (!address) return null;
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM companies WHERE org_id = $1 AND email = $2 LIMIT 1`,
    [orgId, address],
  );
  return rows[0]?.id ?? null;
}

export function emailBodyPath(orgId: string, emailId: string) {
  return `emails/${orgId}/${emailId}.txt`;
}
