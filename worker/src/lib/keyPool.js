const { testApiKey } = require('../../../backend/src/lib/llmProviders');
const { getSubModels } = require('../llm/openrouter');

const ONE_HOUR_MS = 60 * 60 * 1000;
const TEN_MIN_MS = 10 * 60 * 1000;

/** In-process cache for env OPENROUTER_API_KEY — rechecked every 10 min while subs need it. */
const envOpenRouterCache = { healthy: null, lastCheckedAt: 0, lastError: null };

function needsDbKeyRecheck(row, now = Date.now()) {
  const lastCheck = row.last_checked_at ? new Date(row.last_checked_at).getTime() : 0;
  const lastUse = row.last_used_at ? new Date(row.last_used_at).getTime() : 0;
  if (row.status === 'unknown' || row.status === 'unhealthy') return true;
  if (!lastCheck || now - lastCheck > ONE_HOUR_MS) return true;
  if (lastUse && now - lastUse > ONE_HOUR_MS) return true;
  return false;
}

async function applyKeyHealthCheck(client, row) {
  const check = await testApiKey(row.provider, row.api_key);
  await client.query(
    `UPDATE llm_api_keys SET status = $2, last_checked_at = now(), last_error = $3, updated_at = now()
     WHERE id = $1`,
    [row.id, check.healthy ? 'healthy' : 'unhealthy', check.error]
  );
  return check.healthy;
}

/**
 * Validates env OPENROUTER_API_KEY on demand. While unhealthy, retries every 10 min
 * the next time a sub-agent needs an env fallback target.
 */
async function ensureEnvOpenRouterHealthy() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return false;

  const now = Date.now();
  const stale = !envOpenRouterCache.lastCheckedAt || now - envOpenRouterCache.lastCheckedAt >= TEN_MIN_MS;
  if (envOpenRouterCache.healthy === true && !stale) return true;
  if (envOpenRouterCache.healthy === false && !stale) return false;

  const check = await testApiKey('openrouter', apiKey);
  envOpenRouterCache.healthy = check.healthy;
  envOpenRouterCache.lastCheckedAt = now;
  envOpenRouterCache.lastError = check.error;
  return check.healthy;
}

/**
 * On-demand health gate before sub-agent dispatch: test keys when subs are needed,
 * skip re-check for 1h after last check or last successful use. Returns flattened
 * (keyId, provider, model, apiKey) candidates that passed validation.
 */
async function prepareSubAgentPool(client, orgId) {
  const { rows } = await client.query(
    `SELECT id, provider, api_key, models, status, last_checked_at, last_used_at
     FROM llm_api_keys WHERE org_id = $1 AND active = true ORDER BY created_at ASC`,
    [orgId]
  );

  const now = Date.now();
  const pool = [];

  for (const row of rows) {
    let healthy = row.status === 'healthy';
    if (needsDbKeyRecheck(row, now)) {
      healthy = await applyKeyHealthCheck(client, row);
    }
    if (!healthy) continue;

    const models = Array.isArray(row.models) ? row.models : [];
    for (const model of models) {
      pool.push({ keyId: row.id, provider: row.provider, model, apiKey: row.api_key, source: 'db' });
    }
  }

  return pool;
}

/** DB pool entries first (rotated), then env OpenRouter sub-models as fallback. */
function buildSubAgentCandidates(pool, startIndex) {
  const candidates = [];
  if (Array.isArray(pool) && pool.length) {
    for (let i = 0; i < pool.length; i++) {
      candidates.push(pool[(startIndex + i) % pool.length]);
    }
  }

  const envKey = process.env.OPENROUTER_API_KEY;
  const subModels = getSubModels();
  if (envKey && subModels.length) {
    for (let i = 0; i < subModels.length; i++) {
      candidates.push({
        keyId: null,
        provider: 'openrouter',
        model: subModels[(startIndex + i) % subModels.length],
        apiKey: envKey,
        source: 'env',
      });
    }
  }

  return candidates;
}

async function markKeyUsed(client, keyId) {
  if (!keyId) return;
  await client.query(
    `UPDATE llm_api_keys SET last_used_at = now(), updated_at = now() WHERE id = $1`,
    [keyId]
  );
}

async function markKeyUnhealthy(client, keyId, err) {
  if (!keyId) return;
  const msg = String(err?.body || err?.message || err || 'auth failure').slice(0, 2000);
  await client.query(
    `UPDATE llm_api_keys SET status = 'unhealthy', last_checked_at = now(), last_error = $2, updated_at = now()
     WHERE id = $1`,
    [keyId, msg]
  );
}

module.exports = {
  prepareSubAgentPool,
  buildSubAgentCandidates,
  ensureEnvOpenRouterHealthy,
  markKeyUsed,
  markKeyUnhealthy,
  needsDbKeyRecheck,
};
