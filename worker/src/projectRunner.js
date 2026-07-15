/**
 * Claimed project runner: multiple think→act→review iterations per claim,
 * continuous until token budget / hours / due / user stop / rate limit.
 */
const { projectProgress } = require('../../backend/src/lib/projectProgress');
const { saveBuffer } = require('../../backend/src/lib/storage');
const { runOrchestratorCycle } = require('./orchestrator');
const { recordEvent, setStopReason } = require('./events');

function itersPerClaim() {
  const n = Number(process.env.WORKER_ITERS_PER_CLAIM || 5);
  return Number.isFinite(n) && n > 0 ? Math.min(20, Math.floor(n)) : 5;
}

function limitsHit(p, now = new Date()) {
  if (p.due_at && now > new Date(p.due_at)) {
    return { reason: 'deadline', message: `Due date reached (${p.due_at})` };
  }
  if (p.allotted_hours && p.started_at) {
    const elapsedH = (now.getTime() - new Date(p.started_at).getTime()) / (1000 * 60 * 60);
    if (elapsedH >= Number(p.allotted_hours)) {
      return {
        reason: 'hours_exhausted',
        message: `Allotted ${p.allotted_hours}h reached (elapsed ~${elapsedH.toFixed(2)}h)`,
      };
    }
  }
  if (Number(p.tokens_used) >= Number(p.token_budget)) {
    return {
      reason: 'token_budget',
      message: `Token budget exhausted (${p.tokens_used}/${p.token_budget})`,
    };
  }
  return null;
}

async function runProjectStep(pool, project) {
  const client = await pool.connect();
  try {
    let p = (
      await client.query(`SELECT * FROM projects WHERE id = $1 AND status = 'running'`, [project.id])
    ).rows[0];
    if (!p) return;

    const hard = limitsHit(p);
    if (hard) {
      await stopProject(client, p, hard.reason, hard.message, hard.reason === 'token_budget' ? 'completed' : 'paused');
      return;
    }

    const fileNames = (
      await client.query(
        `SELECT filename FROM project_files WHERE project_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [p.id]
      )
    ).rows.map((r) => r.filename);

    const maxIters = itersPerClaim();
    for (let i = 0; i < maxIters; i++) {
      p = (
        await client.query(`SELECT * FROM projects WHERE id = $1 AND status = 'running'`, [p.id])
      ).rows[0];
      if (!p) return;

      const hit = limitsHit(p);
      if (hit) {
        await stopProject(
          client,
          p,
          hit.reason,
          hit.message,
          hit.reason === 'token_budget' ? 'completed' : 'paused'
        );
        return;
      }

      const cycle = Number(p.agent_iteration || 0) + 1;
      await client.query(
        `UPDATE projects SET agent_iteration = $2, updated_at = now() WHERE id = $1`,
        [p.id, cycle]
      );

      const recentRes = await client.query(
        `SELECT stage, action, left(COALESCE(summary, detail), 120) AS detail
         FROM project_agent_events WHERE project_id = $1
         ORDER BY created_at DESC LIMIT 16`,
        [p.id]
      );

      await writeCheckpoint(client, p.id, {
        stage: 'queued',
        detail: `Iteration ${cycle} starting (${i + 1}/${maxIters} this claim)`,
        mode: process.env.OPENROUTER_API_KEY ? 'openrouter' : 'local',
        last_step: cycle,
        cycle,
      });

      await recordEvent(client, {
        projectId: p.id,
        orgId: p.org_id,
        cycle,
        stage: 'control',
        action: 'iteration_start',
        status: 'started',
        summary: `Iteration ${cycle}`,
        detail: `Claim slice ${i + 1}/${maxIters}`,
      });

      const started = Date.now();
      const result = await runOrchestratorCycle(
        { ...p, checkpoint: mergeCheckpoint(p.checkpoint, { cycle }) },
        {
          step: cycle,
          fileNames,
          recentLog: recentRes.rows.map((r) => `${r.stage}:${r.action}:${r.detail || ''}`),
          onProgress: async (evt) => {
            await writeCheckpoint(client, p.id, {
              stage: evt.stage,
              detail: evt.detail || null,
              mode: evt.mode,
              main_model: evt.main_model,
              last_summary: evt.last_summary,
              next_focus: evt.next_focus,
              status: evt.status,
              last_error: evt.last_error || null,
              error_code: evt.error_code || null,
              current_sub: evt.current_sub || null,
              subtask_count: evt.subtask_count,
              sub_ok: evt.sub_ok,
              sub_fail: evt.sub_fail,
              last_step: cycle,
              cycle,
            });
            if (evt.last_error) {
              await client.query(
                `UPDATE projects SET last_error = $2, updated_at = now() WHERE id = $1 AND status = 'running'`,
                [p.id, String(evt.last_error).slice(0, 8000)]
              );
            }
          },
          onEvent: async (evt) => {
            await recordEvent(client, {
              projectId: p.id,
              orgId: p.org_id,
              cycle,
              stage: evt.stage,
              action: evt.action,
              model: evt.model,
              role: evt.role,
              status: evt.status || 'started',
              summary: evt.summary,
              detail: evt.detail,
              errorFull: evt.errorFull,
              tokensUsed: evt.tokensUsed || 0,
              durationMs: evt.durationMs,
            });
            // Mirror into classic work log for observability
            await log(
              client,
              p.id,
              evt.stage,
              evt.action || evt.status,
              evt.summary || evt.detail || '',
              evt.tokensUsed || 0,
              evt.durationMs || 0,
              cycle,
              evt.model || 'orchestrator'
            );
          },
        }
      );
      const duration = Date.now() - started;

      // Rate limit → hard pause
      if (result.rateLimited) {
        const msg =
          result.error?.body ||
          result.error?.message ||
          'OpenRouter rate limit exceeded after retries';
        await recordEvent(client, {
          projectId: p.id,
          orgId: p.org_id,
          cycle,
          stage: 'control',
          action: 'rate_limit_stop',
          status: 'error',
          summary: 'Paused: rate limit',
          detail: result.error?.message,
          errorFull: msg,
        });
        await stopProject(client, p, 'rate_limit', msg, 'paused', result.progress_pct);
        await chatNote(
          client,
          p,
          `**Stopped — rate limit** on iteration ${cycle} at stage \`${result.error?.stage || 'unknown'}\`.\nSee Progress timeline for full error.\n\n${String(result.error?.message || '').slice(0, 500)}`
        );
        return;
      }

      // Fatal LLM errors that aren't rate limit: keep looping unless missing key repeatedly
      if (result.error && result.error.code === 'missing_key') {
        // local mode returns ok; missing mid-run shouldn't happen
      } else if (result.error && result.error.code === 'fatal_error') {
        await stopProject(
          client,
          p,
          'fatal_error',
          result.error.body || result.error.message,
          'paused',
          result.progress_pct
        );
        return;
      }

      await writeCheckpoint(client, p.id, {
        stage: 'saving',
        detail: 'Persisting iteration results',
        cycle,
        last_step: cycle,
      });
      await recordEvent(client, {
        projectId: p.id,
        orgId: p.org_id,
        cycle,
        stage: 'saving',
        action: 'start',
        status: 'started',
        summary: 'Saving outputs',
      });

      const updated = {
        ...p,
        tokens_used: Number(p.tokens_used) + (result.tokens || 0),
      };
      const metrics = projectProgress(updated, new Date(), result.progress_pct);

      const memory = buildMemory(p.checkpoint, result);
      const endStage = result.error ? 'error' : 'idle';
      const checkpointPatch = {
        last_step: cycle,
        cycle,
        status: result.status,
        stage: endStage,
        detail: result.error?.message || result.summary || `Iteration ${cycle} finished`,
        next_focus: result.next_focus,
        last_summary: result.summary,
        last_error: result.error?.message || null,
        error_code: result.error?.code || null,
        mode: result.mode,
        main_model:
          process.env.OPENROUTER_MAIN_MODEL ||
          process.env.OPENROUTER_WORKER_MODEL ||
          'anthropic/claude-haiku-4.5',
        sub_ok: result.sub_ok ?? null,
        sub_fail: result.sub_fail ?? null,
        cycle_ms: duration,
        memory,
        stage_at: new Date().toISOString(),
      };

      await client.query(
        `UPDATE projects SET
           tokens_used = tokens_used + $2,
           progress_pct = $3,
           last_error = $4,
           checkpoint = COALESCE(checkpoint, '{}'::jsonb) || $5::jsonb,
           updated_at = now()
         WHERE id = $1 AND status = 'running'`,
        [
          p.id,
          result.tokens || 0,
          metrics.progressPct,
          result.error?.body || result.error?.message || null,
          JSON.stringify(checkpointPatch),
        ]
      );

      if (result.error) {
        await client.query(
          `INSERT INTO project_messages (project_id, org_id, role, content, error_code)
           VALUES ($1,$2,'error',$3,$4)`,
          [
            p.id,
            p.org_id,
            `[${result.error.stage || 'unknown'}] ${result.error.message}\n(Full body in Progress timeline)`,
            result.error.code || 'orchestrator_error',
          ]
        );
      }

      const report = [
        `**Iteration ${cycle}** · \`${result.status}\` · stage after save: **${endStage}**`,
        result.mode === 'local' ? '_Mode: local (no OPENROUTER_API_KEY)_' : null,
        result.summary || null,
        result.review?.critique ? `Critique: ${result.review.critique.slice(0, 400)}` : null,
        result.review?.new_ideas?.length
          ? `New ideas: ${result.review.new_ideas.slice(0, 3).join('; ')}`
          : null,
        result.next_focus ? `Next: ${result.next_focus}` : null,
        result.sub_ok != null ? `Subs: ${result.sub_ok} ok / ${result.sub_fail || 0} failed` : null,
        `Took ${Math.round(duration / 1000)}s · +${result.tokens || 0} tok · progress ${metrics.progressPct}% · budget ${updated.tokens_used}/${p.token_budget}`,
        'Full stage detail → Progress timeline',
      ]
        .filter(Boolean)
        .join('\n');

      await chatNote(client, p, report);

      if (result.summary) {
        await client.query(
          `INSERT INTO agent_task_results (project_id, category, title, summary, confidence_score)
           VALUES ($1, 'progress', $2, $3, 0.7)`,
          [p.id, `Iter ${cycle} · ${result.status}`, result.summary]
        );
      }

      for (const out of result.outputs || []) {
        await stageDoc(client, p, out);
      }

      await recordEvent(client, {
        projectId: p.id,
        orgId: p.org_id,
        cycle,
        stage: 'saving',
        action: 'ok',
        status: 'ok',
        summary: `Saved iteration ${cycle}`,
        detail: `tokens=+${result.tokens || 0} progress=${metrics.progressPct}%`,
        tokensUsed: result.tokens || 0,
        durationMs: duration,
      });

      // Soft agent "done" does NOT stop — keep looping until budget
      p = { ...p, tokens_used: updated.tokens_used, progress_pct: metrics.progressPct, checkpoint: checkpointPatch };

      const after = limitsHit(p);
      if (after) {
        await stopProject(
          client,
          p,
          after.reason === 'token_budget' ? 'completed_budget' : after.reason,
          after.message,
          after.reason === 'token_budget' ? 'completed' : 'paused',
          metrics.progressPct
        );
        await chatNote(
          client,
          p,
          `**Stopped — ${after.reason}**\n${after.message}`
        );
        return;
      }
    }

    // Release claim so other projects get a turn; leave running for next claim
    await writeCheckpoint(client, p.id, {
      stage: 'idle',
      detail: `Released claim after ${maxIters} iteration(s); will re-claim while running`,
      cycle: p.agent_iteration || p.checkpoint?.cycle,
    });
    await recordEvent(client, {
      projectId: p.id,
      orgId: p.org_id,
      cycle: Number(p.agent_iteration || 0),
      stage: 'control',
      action: 'claim_release',
      status: 'ok',
      summary: 'Claim released — looping resumes on next claim',
      detail: `WORKER_ITERS_PER_CLAIM=${maxIters}. Still running until token budget / stop / rate limit.`,
    });
    await client.query(
      `UPDATE projects SET claimed_by = NULL, claimed_at = NULL, updated_at = now()
       WHERE id = $1 AND status = 'running'`,
      [p.id]
    );
  } finally {
    client.release();
  }
}

function mergeCheckpoint(cp, extra) {
  const base = typeof cp === 'string' ? safeJson(cp) : cp || {};
  return { ...base, ...extra };
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function buildMemory(checkpoint, result) {
  const prev = mergeCheckpoint(checkpoint).memory || {};
  const ideas = [
    ...(Array.isArray(prev.idea_backlog) ? prev.idea_backlog : []),
    ...(result.review?.new_ideas || []),
  ].slice(-20);
  return {
    last_critique: result.review?.critique || prev.last_critique || null,
    idea_backlog: ideas,
    go_back_to: result.review?.go_back_to || prev.go_back_to || 'plan',
    last_status: result.status,
  };
}

async function writeCheckpoint(client, projectId, patch) {
  const body = { ...patch, stage_at: new Date().toISOString() };
  await client.query(
    `UPDATE projects SET
       checkpoint = COALESCE(checkpoint, '{}'::jsonb) || $2::jsonb,
       updated_at = now()
     WHERE id = $1 AND status = 'running'`,
    [projectId, JSON.stringify(body)]
  );
}

async function stopProject(client, p, stopReason, message, status, progressPct = null) {
  const metrics = projectProgress(p, new Date(), progressPct);
  await setStopReason(client, p.id, {
    stopReason,
    lastError: message,
    status,
    progressPct: status === 'completed' ? 100 : metrics.progressPct,
  });
  await client.query(
    `UPDATE projects SET checkpoint = COALESCE(checkpoint, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
    [
      p.id,
      JSON.stringify({
        stage: status === 'completed' ? 'done' : 'error',
        detail: message,
        stop_reason: stopReason,
        stage_at: new Date().toISOString(),
      }),
    ]
  );
  await recordEvent(client, {
    projectId: p.id,
    orgId: p.org_id,
    cycle: Number(p.agent_iteration || 0),
    stage: 'control',
    action: stopReason,
    status: 'error',
    summary: `Stopped: ${stopReason}`,
    detail: message,
    errorFull: message,
  });
  await log(client, p.id, 'control', stopReason, message, 0);
}

async function chatNote(client, p, content) {
  await client.query(
    `INSERT INTO project_messages (project_id, org_id, role, content)
     VALUES ($1,$2,'assistant',$3)`,
    [p.id, p.org_id, content]
  );
}

async function stageDoc(client, p, out) {
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
    [p.id, p.org_id, `Staged document ready for approval: **${out.title}**`, doc.rows[0].id]
  );
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
