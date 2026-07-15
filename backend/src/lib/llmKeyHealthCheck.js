const { query } = require('./db');
const { testApiKey } = require('./llmProviders');

/** Re-validates every active key (all orgs) and updates its stored health. */
async function recheckAllKeys() {
  const { rows } = await query(`SELECT id, provider, api_key FROM llm_api_keys WHERE active = true`);
  for (const row of rows) {
    const check = await testApiKey(row.provider, row.api_key);
    await query(
      `UPDATE llm_api_keys SET status = $2, last_checked_at = now(), last_error = $3, updated_at = now()
       WHERE id = $1`,
      [row.id, check.healthy ? 'healthy' : 'unhealthy', check.error]
    );
  }
  return rows.length;
}

module.exports = { recheckAllKeys };
