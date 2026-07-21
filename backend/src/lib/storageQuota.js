const { query } = require('./db');

// Simple org-wide cap on total document bytes on disk. Enforced at upload time;
// live-computed from shared_documents rather than tracked in a separate counter
// so it can never drift out of sync with what's actually on disk.
const ORG_STORAGE_LIMIT_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB

async function getOrgStorageUsage(orgId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(size_bytes), 0)::bigint AS used FROM shared_documents WHERE org_id = $1`,
    [orgId]
  );
  return Number(rows[0]?.used || 0);
}

async function assertStorageRoom(orgId, incomingBytes) {
  const used = await getOrgStorageUsage(orgId);
  if (used + incomingBytes > ORG_STORAGE_LIMIT_BYTES) {
    const err = new Error(
      `Storage limit reached (${(ORG_STORAGE_LIMIT_BYTES / 1024 ** 3).toFixed(0)} GB). ` +
        `Currently using ${(used / 1024 ** 3).toFixed(2)} GB — free up space or delete unused documents.`
    );
    err.status = 413;
    throw err;
  }
  return used;
}

module.exports = { ORG_STORAGE_LIMIT_BYTES, getOrgStorageUsage, assertStorageRoom };
