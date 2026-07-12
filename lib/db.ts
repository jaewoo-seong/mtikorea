import { Pool, type QueryResultRow } from "pg";

declare global {
  var __pgPool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });
}

// Lazily create the pool on first use (not at import time) so merely
// importing this module doesn't crash builds/routes in environments where
// DATABASE_URL isn't configured yet. Reuse the pool across dev hot reloads.
export function getPool() {
  if (!global.__pgPool) {
    global.__pgPool = createPool();
  }
  return global.__pgPool;
}

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return getPool().query<T>(text, params);
}
