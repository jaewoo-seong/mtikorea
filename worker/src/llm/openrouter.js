const FALLBACK_MAIN = 'anthropic/claude-haiku-4.5';
const FALLBACK_SUBS =
  'meta-llama/llama-3.3-70b-instruct:free,google/gemma-3-27b-it:free,mistralai/mistral-small-3.1-24b-instruct:free';

function getMainModel() {
  return (
    process.env.OPENROUTER_MAIN_MODEL ||
    process.env.OPENROUTER_WORKER_MODEL ||
    FALLBACK_MAIN
  );
}

function getSubModels() {
  const raw = process.env.OPENROUTER_SUB_MODELS || FALLBACK_SUBS;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : ['meta-llama/llama-3.3-70b-instruct:free'];
}

function hasApiKey() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

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
 * OpenRouter chat with retries on rate limit.
 * Throws err with: code, status, body (full up to 8k), rateLimited boolean
 */
async function chat({ model, messages, maxTokens = 1200, temperature = 0.4, onRetry }) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    const err = new Error('OPENROUTER_API_KEY missing');
    err.code = 'missing_key';
    err.body = 'OPENROUTER_API_KEY is not set on the Worker';
    throw err;
  }

  const retries = maxRetries();
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
        'X-Title': 'MTI CRM Worker',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
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
      return { content, tokens, model, raw: data, attempts: attempt + 1 };
    }

    const rateLimited = isRateLimit(resp.status, text);
    const err = new Error(
      rateLimited
        ? `OpenRouter rate limit (HTTP ${resp.status}) after attempt ${attempt + 1}/${retries + 1}`
        : `OpenRouter ${resp.status}: ${text.slice(0, 500)}`
    );
    err.code = rateLimited ? 'rate_limit' : 'openrouter_http';
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

module.exports = {
  chat,
  getMainModel,
  getSubModels,
  hasApiKey,
  isRateLimit,
  maxRetries,
};
