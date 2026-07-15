/**
 * Strip markdown fences and parse orchestrator JSON. Fallback on failure.
 */
function parseAgentJson(text, fallback = {}) {
  if (text == null || typeof text !== 'string') {
    return { ...fallback, _parseError: 'empty' };
  }

  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    raw = raw.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return { ...fallback, _parseError: 'not_object', summary: String(text).slice(0, 500) };
  } catch (err) {
    return {
      ...fallback,
      _parseError: err.message,
      status: fallback.status || 'continue',
      summary: String(text).slice(0, 800),
      progress_pct: fallback.progress_pct,
      subtasks: [],
      outputs: [],
    };
  }
}

function normalizePlan(plan, step) {
  const status = ['continue', 'deliverable_ready', 'blocked', 'done'].includes(plan.status)
    ? plan.status
    : 'continue';

  let progress = Number(plan.progress_pct);
  if (!Number.isFinite(progress)) progress = null;
  else progress = Math.max(0, Math.min(100, progress));

  const subtasks = Array.isArray(plan.subtasks)
    ? plan.subtasks
        .slice(0, 8)
        .map((t) => ({
          role: String(t.role || 'researcher').slice(0, 64),
          prompt: String(t.prompt || t.task || '').slice(0, 4000),
          expect: String(t.expect || '').slice(0, 500),
        }))
        .filter((t) => t.prompt)
    : [];

  const outputs = Array.isArray(plan.outputs)
    ? plan.outputs
        .slice(0, 5)
        .map((o) => ({
          title: String(o.title || `Agent deliverable · step ${step}`).slice(0, 200),
          content_markdown: String(o.content_markdown || o.content || '').slice(0, 50000),
        }))
        .filter((o) => o.content_markdown)
    : [];

  return {
    status,
    progress_pct: progress,
    summary: String(plan.summary || '').slice(0, 4000) || `Orchestrator cycle ${step}`,
    next_focus: plan.next_focus != null ? String(plan.next_focus).slice(0, 2000) : null,
    subtasks,
    outputs,
    _parseError: plan._parseError || null,
  };
}

module.exports = { parseAgentJson, normalizePlan };
