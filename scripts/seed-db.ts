import "dotenv/config";
import { Pool } from "pg";

// Stub: real seed data (default organization, admin user) lands with the
// admin-panel phase once role assignment UI exists. For now this just
// verifies the schema is reachable.
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (check .env.local)");
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  const { rows } = await pool.query("SELECT count(*)::int AS count FROM organizations");
  console.log(`organizations table reachable, ${rows[0].count} row(s).`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
