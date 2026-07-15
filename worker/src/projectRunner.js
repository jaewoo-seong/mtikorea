/**
 * Advances one claimed project through a full orchestrator cycle
 * (Haiku main → free sub-agents → synth), then releases the claim.
 */
const { projectProgress } = require('../../backend/src/lib/projectProgress');
const { saveBuffer } = require('../../backend/src/lib/storage');
const { runOrchestratorCycle } = require('./orchestrator');

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

    const filesRes = await client.query(
      `SELECT filename FROM project_files WHERE project_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [p.id]
    );
    const recentRes = await client.query(
      `SELECT phase, action, left(detail, 120) AS detail
       FROM agent_work_log WHERE project_id = $1
       ORDER BY step_number DESC LIMIT 12`,
      [p.id]
    );

    const started = Date.now();
    const cycle = await runOrchestratorCycle(p, {
      step,
      fileNames: filesRes.rows.map((r) => r.filename),
      recentLog: recentRes.rows.map((r) => `${r.phase}:${r.action}:${r.detail || ''}`),
    });
    const duration = Date.now() - started;

    // Persist per-phase logs (share cycle step number; sub_agent = model slug)
    if (cycle.logs?.length) {
      for (const entry of cycle.logs) {
        await log(
          client,
          p.id,
          entry.phase,
          entry.action,
          entry.detail,
          entry.tokens || 0,
          Math.round(duration / cycle.logs.length),
          step,
          entry.subAgent || 'orchestrator'
        );
      }
    } else {
      await log(
        client,
        p.id,
        'orchestration',
        'cycle',
        cycle.detail || cycle.summary || `Cycle ${step}`,
        cycle.tokens || 0,
        duration,
        step,
        'orchestrator'
      );
    }

    const updated = {
      ...p,
      tokens_used: Number(p.tokens_used) + (cycle.tokens || 0),
    };
    const metrics = projectProgress(updated, new Date(), cycle.progress_pct);

    const checkpointPatch = {
      last_step: step,
      status: cycle.status,
      next_focus: cycle.next_focus,
      last_summary: cycle.summary,
      main_model: process.env.OPENROUTER_MAIN_MODEL || process.env.OPENROUTER_WORKER_MODEL || 'anthropic/claude-haiku-4.5',
    };

    await client.query(
      `UPDATE projects SET
         tokens_used = tokens_used + $2,
         progress_pct = $3,
         checkpoint = COALESCE(checkpoint, '{}'::jsonb) || $4::jsonb,
         claimed_by = NULL,
         claimed_at = NULL,
         updated_at = now()
       WHERE id = $1 AND status = 'running'`,
      [p.id, cycle.tokens || 0, metrics.progressPct, JSON.stringify(checkpointPatch)]
    );

    if (cycle.error) {
      await client.query(
        `INSERT INTO project_messages (project_id, org_id, role, content, error_code)
         VALUES ($1,$2,'error',$3,$4)`,
        [p.id, p.org_id, cycle.error.message, cycle.error.code || 'orchestrator_error']
      );
    }

    if (cycle.summary) {
      await client.query(
        `INSERT INTO project_messages (project_id, org_id, role, content, error_code)
         VALUES ($1,$2,'assistant',$3,NULL)`,
        [p.id, p.org_id, cycle.summary]
      );

      await client.query(
        `INSERT INTO agent_task_results (project_id, category, title, summary, confidence_score)
         VALUES ($1, 'progress', $2, $3, 0.7)`,
        [p.id, `Cycle ${step} · ${cycle.status}`, cycle.summary]
      );
    }

    for (const out of cycle.outputs || []) {
      const safeName = `${out.title.replace(/[^\w.\-]+/g, '_').slice(0, 80)}.md`;
      const saved = saveBuffer(
        `projects/${p.id}/staged`,
        safeName,
        Buffer.from(out.content_markdown, 'utf8')
      );
      const doc = await client.query(
        `INSERT INTO shared_documents (
           org_id, client_id, project_id, title, description, filename, mime_type, size_bytes,
           storage_path, uploaded_by, visibility, source
         ) VALUES ($1,$2,$3,$4,$5,$6,'text/markdown',$7,$8,NULL,'staged','agent')
         RETURNING id`,
        [
          p.org_id,
          p.client_id,
          p.id,
          out.title,
          out.content_markdown.slice(0, 500),
          safeName,
          saved.size,
          saved.storagePath,
        ]
      );
      await client.query(
        `INSERT INTO project_messages (project_id, org_id, role, content, document_id)
         VALUES ($1,$2,'assistant',$3,$4)`,
        [
          p.id,
          p.org_id,
          `Staged document ready for approval: **${out.title}**`,
          doc.rows[0].id,
        ]
      );
    }

    if (cycle.status === 'done' || metrics.progressPct >= 100) {
      await client.query(
        `UPDATE projects SET status = 'completed', completed_at = now(), claimed_by = NULL,
           progress_pct = GREATEST(progress_pct, 100), updated_at = now()
         WHERE id = $1 AND status = 'running'`,
        [p.id]
      );
      await log(client, p.id, 'control', 'cycle_complete', 'Orchestrator marked done / 100%', 0, 0, step + 1);
    }
  } finally {
    client.release();
  }
}

async function log(
  client,
  projectId,
  phase,
  action,
  detail,
  tokens,
  durationMs = 0,
  step = null,
  subAgent = 'orchestrator'
) {
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
    [projectId, stepNumber, phase, action, detail, tokens, durationMs, subAgent]
  );
}

module.exports = { runProjectStep };
