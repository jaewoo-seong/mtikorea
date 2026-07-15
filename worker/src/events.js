const { recordEvent, clip, ERROR_CAP } = require('../../backend/src/lib/agentEvents');

async function setStopReason(client, projectId, {
  stopReason,
  lastError = null,
  status = 'paused',
  progressPct = null,
}) {
  const fields = [
    `status = $2`,
    `stop_reason = $3`,
    `last_error = $4`,
    `claimed_by = NULL`,
    `claimed_at = NULL`,
    `updated_at = now()`,
  ];
  const params = [projectId, status, stopReason, lastError != null ? clip(lastError, ERROR_CAP) : null];
  if (status === 'paused') {
    fields.push(`stopped_at = now()`);
  }
  if (status === 'completed') {
    fields.push(`completed_at = now()`);
  }
  if (progressPct != null) {
    params.push(progressPct);
    fields.push(`progress_pct = $${params.length}`);
  }
  await client.query(`UPDATE projects SET ${fields.join(', ')} WHERE id = $1`, params);
}

module.exports = { recordEvent, setStopReason, clip, ERROR_CAP };
