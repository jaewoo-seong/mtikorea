import { config } from "dotenv";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

config({ path: ".env.local" });

const migrationsDir = path.join(process.cwd(), "migrations");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (check .env.local)");
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT now()
    );
  `);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (rows.length > 0) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }

    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    console.log(`apply ${file}`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  console.log("done.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
