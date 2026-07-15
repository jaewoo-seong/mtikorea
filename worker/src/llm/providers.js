// Provider-agnostic OpenAI-compatible chat caller, generalizing llm/openrouter.js's
// chat() to accept a caller-supplied provider + API key instead of always reading
// OPENROUTER_API_KEY — used for the DB-driven, multi-key sub-agent pool.
const PROVIDERS = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
      'X-Title': 'MTI CRM Worker',
    }),
  },
  nvidia: {
    baseUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
};

function maxRetries() {
  const n = Number(process.env.OPENROUTER_MAX_RETRIES || 3);
  return Number.isFinite(n) && n >= 0 ? Math.min(8, Math.floor(n)) : 3;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimit(status, body) {
  if (status === 429) return true;
  const t = String(body || '').toLowerCase();
  return t.includes('rate limit') || t.includes('rate_limit') || t.includes('too many requests');
}

/**
 * Chat with retries on rate limit, against whichever provider is named.
 * Throws err with: code, status, body (full up to 8k), rateLimited boolean
 */
async function callProvider({ provider, apiKey, model, messages, maxTokens = 900, temperature = 0.5, onRetry }) {
  const config = PROVIDERS[provider];
  if (!config) {
    const err = new Error(`Unknown provider: ${provider}`);
    err.code = 'unknown_provider';
    throw err;
  }
  if (!apiKey) {
    const err = new Error(`No API key configured for provider ${provider}`);
    err.code = 'missing_key';
    throw err;
  }

  const retries = maxRetries();
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(config.baseUrl, {
      method: 'POST',
      headers: config.headers(apiKey),
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    });

    const text = await resp.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (resp.ok) {
      const content = data.choices?.[0]?.message?.content || '';
      const tokens =
        data.usage?.total_tokens ||
        (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0) ||
        Math.max(50, Math.round(content.length / 4));
      return { content, tokens, model, provider, raw: data, attempts: attempt + 1 };
    }

    const rateLimited = isRateLimit(resp.status, text);
    const err = new Error(
      rateLimited
        ? `${provider} rate limit (HTTP ${resp.status}) after attempt ${attempt + 1}/${retries + 1}`
        : `${provider} ${resp.status}: ${text.slice(0, 500)}`
    );
    err.code = rateLimited ? 'rate_limit' : `${provider}_http`;
    err.status = resp.status;
    err.body = text.slice(0, 8000);
    err.rateLimited = rateLimited;
    lastErr = err;

    if (rateLimited && attempt < retries) {
      const delay = Math.min(60000, 2000 * 2 ** attempt);
      if (typeof onRetry === 'function') {
        await onRetry({ attempt: attempt + 1, retries, delay, status: resp.status, body: text });
      }
      await sleep(delay);
      continue;
    }
    throw err;
  }

  throw lastErr;
}

function isAuthFailure(err) {
  if (!err) return false;
  if (err.code === 'missing_key') return true;
  if (err.status === 401 || err.status === 403) return true;
  const text = String(err.body || err.message || '').toLowerCase();
  return (
    text.includes('invalid api key') ||
    text.includes('incorrect api key') ||
    text.includes('unauthorized') ||
    text.includes('authentication') ||
    text.includes('invalid authentication')
  );
}

module.exports = { callProvider, PROVIDERS, isAuthFailure };
