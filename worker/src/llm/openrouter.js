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

/**
 * OpenRouter chat completions (OpenAI-compatible).
 * @returns {{ content: string, tokens: number, model: string, raw?: object }}
 */
async function chat({ model, messages, maxTokens = 1200, temperature = 0.4 }) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    const err = new Error('OPENROUTER_API_KEY missing');
    err.code = 'missing_key';
    throw err;
  }

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

  if (!resp.ok) {
    const err = new Error(`OpenRouter ${resp.status}: ${text.slice(0, 500)}`);
    err.code = 'openrouter_http';
    err.status = resp.status;
    err.body = text.slice(0, 800);
    throw err;
  }

  const content = data.choices?.[0]?.message?.content || '';
  const tokens =
    data.usage?.total_tokens ||
    (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0) ||
    Math.max(50, Math.round(content.length / 4));

  return { content, tokens, model, raw: data };
}

module.exports = {
  chat,
  getMainModel,
  getSubModels,
  hasApiKey,
};
