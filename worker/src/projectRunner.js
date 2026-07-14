/**
 * Advances one claimed project. Respects Stop, token budget, allotted hours, and due dates.
 */
const { projectProgress } = require('../../backend/src/lib/projectProgress');
const { saveBuffer } = require('../../backend/src/lib/storage');

async function runProjectStep(pool, project) {
  const client = await pool.connect();
  try {
    const fresh = await client.query(
      `SELECT * FROM projects WHERE id = $1 AND status = 'running'`,
      [project.id]
    );
    if (!fresh.rows[0]) return;

    const p = fresh.rows[0];
    const now = new Date();

    if (p.due_at && now > new Date(p.due_at)) {
      await client.query(
        `UPDATE projects SET status = 'paused', stopped_at = now(), claimed_by = NULL,
           progress_pct = $2, updated_at = now() WHERE id = $1`,
        [p.id, projectProgress(p, now).progressPct]
      );
      await log(client, p.id, 'control', 'deadline', 'Due date reached — worker paused project', 0);
      return;
    }

    if (p.allotted_hours && p.started_at) {
      const elapsedH = (now.getTime() - new Date(p.started_at).getTime()) / (1000 * 60 * 60);
      if (elapsedH >= Number(p.allotted_hours)) {
        await client.query(
          `UPDATE projects SET status = 'paused', stopped_at = now(), claimed_by = NULL,
             progress_pct = 100, updated_at = now() WHERE id = $1`,
          [p.id]
        );
        await log(
          client,
          p.id,
          'control',
          'hours_exhausted',
          `Allotted ${p.allotted_hours}h reached — worker paused project`,
          0
        );
        return;
      }
    }

    if (p.tokens_used >= p.token_budget) {
      await client.query(
        `UPDATE projects SET status = 'completed', completed_at = now(), claimed_by = NULL,
           progress_pct = 100, updated_at = now() WHERE id = $1`,
        [p.id]
      );
      await log(client, p.id, 'control', 'budget_exhausted', 'Token budget reached', 0);
      return;
    }

    const stepRes = await client.query(
      `SELECT COALESCE(MAX(step_number), 0) + 1 AS n FROM agent_work_log WHERE project_id = $1`,
      [p.id]
    );
    const step = stepRes.rows[0].n;

    const started = Date.now();
    const { detail, tokens, phase, action, summary } = await executeAgentTick(p, step);
    const duration = Date.now() - started;

    await log(client, p.id, phase, action, detail, tokens, duration, step);

    const updated = {
      ...p,
      tokens_used: Number(p.tokens_used) + tokens,
    };
    const metrics = projectProgress(updated, new Date());

    await client.query(
      `UPDATE projects SET
         tokens_used = tokens_used + $2,
         progress_pct = $3,
         checkpoint = jsonb_set(COALESCE(checkpoint, '{}'::jsonb), '{last_step}', to_jsonb($4::int), true),
         claimed_by = NULL,
         claimed_at = NULL,
         updated_at = now()
       WHERE id = $1 AND status = 'running'`,
      [p.id, tokens, metrics.progressPct, step]
    );

    if (summary) {
      await client.query(
        `INSERT INTO agent_task_results (project_id, category, title, summary, confidence_score)
         VALUES ($1, 'progress', $2, $3, 0.6)`,
        [p.id, `Step ${step}`, summary]
      );

      if (step % 3 === 0) {
        const saved = saveBuffer(
          `projects/${p.id}`,
          `report-step-${step}.txt`,
          Buffer.from(summary, 'utf8')
        );
        await client.query(
          `INSERT INTO shared_documents (
             org_id, client_id, project_id, title, description, filename, mime_type, size_bytes, storage_path, uploaded_by
           ) VALUES ($1,$2,$3,$4,$5,$6,'text/plain',$7,$8,NULL)`,
          [
            p.org_id,
            p.client_id,
            p.id,
            `Worker report · step ${step}`,
            summary.slice(0, 500),
            `report-step-${step}.txt`,
            saved.size,
            saved.storagePath,
          ]
        );
      }
    }

    if (metrics.progressPct >= 100) {
      await client.query(
        `UPDATE projects SET status = 'completed', completed_at = now(), claimed_by = NULL,
           progress_pct = 100, updated_at = now()
         WHERE id = $1 AND status = 'running'`,
        [p.id]
      );
      await log(client, p.id, 'control', 'schedule_complete', 'Progress reached 100%', 0, 0, step + 1);
    }
  } finally {
    client.release();
  }
}

async function log(client, projectId, phase, action, detail, tokens, durationMs = 0, step = null) {
  let stepNumber = step;
  if (stepNumber == null) {
    const r = await client.query(
      `SELECT COALESCE(MAX(step_number), 0) + 1 AS n FROM agent_work_log WHERE project_id = $1`,
      [projectId]
    );
    stepNumber = r.rows[0].n;
  }
  await client.query(
    `INSERT INTO agent_work_log (project_id, step_number, phase, action, detail, tokens_used, duration_ms, sub_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [projectId, stepNumber, phase, action, detail, tokens, durationMs, 'project-worker']
  );
}

async function executeAgentTick(project, step) {
  const key = process.env.OPENROUTER_API_KEY;
  const scheduleNote = [
    project.allotted_hours != null ? `Allotted hours: ${project.allotted_hours}` : null,
    project.due_at ? `Due: ${project.due_at}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!key) {
    const tokens = 120 + step * 10;
    return {
      phase: 'orchestration',
      action: 'local_progress',
      detail: `Local agent tick ${step} on "${project.title}". Goal: ${project.goal || '(none)'}. ${scheduleNote}`,
      summary: `Completed work slice ${step}${scheduleNote ? ` (${scheduleNote})` : ''}`,
      tokens,
    };
  }

  try {
    const prompt = [
      `You are an MTI project worker agent.`,
      `Project: ${project.title}`,
      `Goal: ${project.goal || 'n/a'}`,
      `Step: ${step}`,
      scheduleNote,
      `Checkpoint: ${JSON.stringify(project.checkpoint || {})}`,
      `Work within the time budget. Return a short progress update (3-6 sentences).`,
    ]
      .filter(Boolean)
      .join('\n');

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
        'X-Title': 'MTI CRM Worker',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_WORKER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return {
        phase: 'orchestration',
        action: 'llm_error',
        detail: `OpenRouter ${resp.status}: ${text.slice(0, 400)}`,
        summary: null,
        tokens: 50,
      };
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || 200;
    return {
      phase: 'sub_agent_call',
      action: 'openrouter_tick',
      detail: content,
      summary: content.slice(0, 280),
      tokens,
    };
  } catch (err) {
    return {
      phase: 'orchestration',
      action: 'llm_exception',
      detail: err.message,
      summary: null,
      tokens: 20,
    };
  }
}

module.exports = { runProjectStep };
