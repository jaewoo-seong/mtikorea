// Lightweight, no-completion-cost "does this key work" checks per provider.
const PROVIDER_CONFIG = {
  // GET /auth/key returns the key's own account/limit info if valid — no chat
  // completion (and therefore no token cost) required to validate.
  openrouter: { testUrl: 'https://openrouter.ai/api/v1/auth/key' },
  // NVIDIA NIM is OpenAI-compatible; GET /v1/models requires valid auth and
  // costs nothing to call, same idea.
  nvidia: { testUrl: 'https://integrate.api.nvidia.com/v1/models' },
};

async function testApiKey(provider, apiKey) {
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    return { healthy: false, error: `Unknown provider: ${provider}` };
  }
  try {
    const resp = await fetch(config.testUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (resp.ok) return { healthy: true, error: null };
    const text = await resp.text().catch(() => '');
    return { healthy: false, error: `HTTP ${resp.status}: ${text.slice(0, 300)}` };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

module.exports = { testApiKey, PROVIDER_CONFIG };
