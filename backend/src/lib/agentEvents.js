const ERROR_CAP = 8000;
const DETAIL_CAP = 50000;

function clip(text, max) {
  if (text == null) return null;
  const s = typeof text === 'string' ? text : JSON.stringify(text);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated ${s.length - max} chars]`;
}

async function recordEvent(clientOrQuery, {
  projectId,
  orgId,
  cycle = 0,
  stage,
  action = null,
  model = null,
  role = null,
  status = 'started',
  summary = null,
  detail = null,
  errorFull = null,
  tokensUsed = 0,
  durationMs = null,
}) {
  const exec = typeof clientOrQuery.query === 'function'
    ? clientOrQuery.query.bind(clientOrQuery)
    : clientOrQuery;

  const seqRes = await exec(
    `SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM project_agent_events WHERE project_id = $1`,
    [projectId]
  );
  const seq = seqRes.rows[0].n;
  const { rows } = await exec(
    `INSERT INTO project_agent_events (
       project_id, org_id, cycle, seq, stage, action, model, role, status,
       summary, detail, error_full, tokens_used, duration_ms
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      projectId,
      orgId,
      cycle,
      seq,
      stage,
      action,
      model,
      role,
      status,
      summary != null ? clip(summary, 2000) : null,
      detail != null ? clip(detail, DETAIL_CAP) : null,
      errorFull != null ? clip(errorFull, ERROR_CAP) : null,
      tokensUsed || 0,
      durationMs,
    ]
  );
  return rows[0];
}

module.exports = { recordEvent, clip, ERROR_CAP };
