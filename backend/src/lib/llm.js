function mainModel() {
  return (
    process.env.OPENROUTER_MAIN_MODEL ||
    process.env.OPENROUTER_WORKER_MODEL ||
    'anthropic/claude-haiku-4.5'
  );
}

const CLEAN_SYSTEM = `You turn a rough, unstructured dump of notes into a clear, actionable project brief/prompt for an autonomous AI agent.
Be concise and concrete. Preserve every real requirement and constraint from the input — do not invent new ones.
Return ONLY the rewritten brief as plain text (no preamble, no markdown headers, no surrounding quotes).`;

/** Synchronous one-shot rewrite — used by the New Project page's "Clean with AI" button. */
async function cleanPrompt(rawText) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    const err = new Error('AI cleanup is not configured (OPENROUTER_API_KEY missing on the backend)');
    err.status = 503;
    throw err;
  }
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
      'X-Title': 'MTI CRM',
    },
    body: JSON.stringify({
      model: mainModel(),
      messages: [
        { role: 'system', content: CLEAN_SYSTEM },
        { role: 'user', content: rawText },
      ],
      max_tokens: 1200,
      temperature: 0.3,
    }),
  });
  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!resp.ok) {
    const err = new Error(data?.error?.message || `OpenRouter error (HTTP ${resp.status})`);
    err.status = 502;
    throw err;
  }
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    const err = new Error('OpenRouter returned an empty response');
    err.status = 502;
    throw err;
  }
  return content;
}

module.exports = { cleanPrompt };
