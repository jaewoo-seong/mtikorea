/**
 * Flattens the org's active, healthy llm_api_keys rows into a rotation pool of
 * individual (provider, model, apiKey) candidates — one key with 3 models
 * contributes 3 entries. Unhealthy/inactive keys are excluded here so the
 * orchestrator never has to know about key health, only which candidates are
 * currently safe to use.
 */
async function fetchHealthyKeyPool(client, orgId) {
  const { rows } = await client.query(
    `SELECT provider, api_key, models FROM llm_api_keys
     WHERE org_id = $1 AND active = true AND status != 'unhealthy'
     ORDER BY created_at ASC`,
    [orgId]
  );
  const pool = [];
  for (const row of rows) {
    const models = Array.isArray(row.models) ? row.models : [];
    for (const model of models) {
      pool.push({ provider: row.provider, model, apiKey: row.api_key });
    }
  }
  return pool;
}

module.exports = { fetchHealthyKeyPool };
