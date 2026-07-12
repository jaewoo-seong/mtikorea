import { config } from "dotenv";
import { Pool } from "pg";
import { writeStorageFile } from "../lib/fileStorage";

config({ path: ".env.local" });

// Manual, opt-in dev seed data (npm run db:seed) — never runs automatically,
// nothing in the running app fabricates data on its own. This exists purely
// so local testing/screenshots have something realistic to look at before
// Gmail sync / the agent orchestrator are wired up. All company names below
// are fictional placeholders, not real businesses.

const DEFAULT_ORG_NAME = "MTI Technology";
const DEFAULT_ORG_SLUG = "mti";

interface CompanySeed {
  name: string;
  korean_name: string;
  industry: string;
  email: string;
  status: "prospect" | "lead" | "customer" | "inactive";
}

const COMPANIES: CompanySeed[] = [
  { name: "Ilsan Precision Machinery", korean_name: "일산정밀기계", industry: "Manufacturing", email: "contact@ilsan-precision.example", status: "customer" },
  { name: "Bukhan Robotics", korean_name: "북한로보틱스", industry: "Robotics", email: "sales@bukhan-robotics.example", status: "lead" },
  { name: "Cheongju Materials Group", korean_name: "청주소재그룹", industry: "Materials Science", email: "info@cheongju-materials.example", status: "prospect" },
  { name: "Daegu Circuit Works", korean_name: "대구회로공업", industry: "Electronics", email: "hello@daegu-circuit.example", status: "customer" },
  { name: "Busan Marine Components", korean_name: "부산해양부품", industry: "Marine Engineering", email: "contact@busan-marine.example", status: "inactive" },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (check .env.local)");
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  const { rows: orgRows } = await pool.query<{ id: string }>(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
     RETURNING id`,
    [DEFAULT_ORG_NAME, DEFAULT_ORG_SLUG],
  );
  const orgId = orgRows[0].id;
  console.log(`org: ${orgId}`);

  const companyIds: Record<string, string> = {};
  for (const c of COMPANIES) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO companies (org_id, name, korean_name, industry, email, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (org_id, name) DO UPDATE SET status = EXCLUDED.status
       RETURNING id`,
      [orgId, c.name, c.korean_name, c.industry, c.email, c.status],
    );
    companyIds[c.name] = rows[0].id;
  }
  console.log(`companies: ${Object.keys(companyIds).length}`);

  const { rows: existingTasks } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM agent_tasks WHERE org_id = $1`,
    [orgId],
  );
  if (Number(existingTasks[0].count) === 0) {
    await pool.query(
      `INSERT INTO agent_tasks (org_id, company_id, title, description, status, tokens_used, token_budget, started_at, completed_at)
       VALUES
         ($1, $2, 'Research Ilsan Precision''s recent expansion plans', 'Summarize public filings and news from the last 6 months.', 'completed', 18000, 50000, now() - interval '2 days', now() - interval '1 day'),
         ($1, $3, 'Draft outreach email for Bukhan Robotics', 'Personalized intro referencing their new product line.', 'running', 8000, 50000, now() - interval '10 minutes', NULL),
         ($1, NULL, 'Compile prospect list: materials science sector', 'Find 10 Korean materials-science companies not yet in the CRM.', 'queued', 0, 50000, NULL, NULL)`,
      [orgId, companyIds["Ilsan Precision Machinery"], companyIds["Bukhan Robotics"]],
    );
    console.log("tasks: 3");
  } else {
    console.log("tasks: skipped (already present)");
  }

  const { rows: existingEmails } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM emails WHERE org_id = $1`,
    [orgId],
  );
  if (Number(existingEmails[0].count) === 0) {
    const devAddress = "dev@mti.local";

    // Thread 1: Ilsan Precision — received then replied.
    const { rows: thread1 } = await pool.query<{ id: string }>(
      `INSERT INTO email_threads (org_id, company_id, subject, participant_emails)
       VALUES ($1, $2, 'Partnership proposal', $3) RETURNING id`,
      [orgId, companyIds["Ilsan Precision Machinery"], [devAddress, "contact@ilsan-precision.example"]],
    );
    const { rows: email1 } = await pool.query<{ id: string }>(
      `INSERT INTO emails (org_id, company_id, thread_id, from_address, to_address, subject, direction, read, received_at)
       VALUES ($1, $2, $3, 'contact@ilsan-precision.example', $4, 'Partnership proposal', 'received', false, now() - interval '2 days')
       RETURNING id`,
      [orgId, companyIds["Ilsan Precision Machinery"], thread1[0].id, devAddress],
    );
    await writeStorageFile(
      `emails/${orgId}/${email1[0].id}.txt`,
      "Hi team,\n\nWe've reviewed your platform and would like to explore a partnership for our upcoming production line expansion. Could we schedule a call next week?\n\nBest,\nIlsan Precision Machinery",
    );

    const { rows: email2 } = await pool.query<{ id: string }>(
      `INSERT INTO emails (org_id, company_id, thread_id, from_address, to_address, subject, direction, read, sent_at)
       VALUES ($1, $2, $3, $4, 'contact@ilsan-precision.example', 'Re: Partnership proposal', 'sent', true, now() - interval '1 day')
       RETURNING id`,
      [orgId, companyIds["Ilsan Precision Machinery"], thread1[0].id, devAddress],
    );
    await writeStorageFile(
      `emails/${orgId}/${email2[0].id}.txt`,
      "Hi,\n\nThanks for reaching out — happy to set up a call. Does Tuesday at 2pm KST work on your end?\n\nBest,\nMTI Technology",
    );
    await pool.query(`UPDATE email_threads SET last_email_id = $1 WHERE id = $2`, [
      email2[0].id,
      thread1[0].id,
    ]);

    // Thread 2: Bukhan Robotics — single received email, unread.
    const { rows: thread2 } = await pool.query<{ id: string }>(
      `INSERT INTO email_threads (org_id, company_id, subject, participant_emails)
       VALUES ($1, $2, 'Question about your product line', $3) RETURNING id`,
      [orgId, companyIds["Bukhan Robotics"], [devAddress, "sales@bukhan-robotics.example"]],
    );
    const { rows: email3 } = await pool.query<{ id: string }>(
      `INSERT INTO emails (org_id, company_id, thread_id, from_address, to_address, subject, direction, read, received_at)
       VALUES ($1, $2, $3, 'sales@bukhan-robotics.example', $4, 'Question about your product line', 'received', false, now() - interval '3 hours')
       RETURNING id`,
      [orgId, companyIds["Bukhan Robotics"], thread2[0].id, devAddress],
    );
    await writeStorageFile(
      `emails/${orgId}/${email3[0].id}.txt`,
      "Hello,\n\nDo you offer volume discounts for orders over 500 units? We're evaluating suppliers for a Q3 rollout.\n\nThanks,\nBukhan Robotics",
    );
    await pool.query(`UPDATE email_threads SET last_email_id = $1 WHERE id = $2`, [
      email3[0].id,
      thread2[0].id,
    ]);

    console.log("emails: 3 (2 threads)");
  } else {
    console.log("emails: skipped (already present)");
  }

  await pool.end();
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
