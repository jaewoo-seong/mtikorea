/**
 * Claimed project runner: multiple think→act→review iterations per claim,
 * continuous until time budget / user stop / rate limit. Token usage is still
 * recorded (for cost visibility in Settings) but no longer stops a project.
 */
const { projectProgress } = require('../../backend/src/lib/projectProgress');
const { saveBuffer } = require('../../backend/src/lib/storage');
const { runOrchestratorCycle, runWrapUpCycle } = require('./orchestrator');
const { prepareSubAgentPool, markKeyUsed, markKeyUnhealthy } = require('./lib/keyPool');
const { recordEvent, setStopReason } = require('./events');

// Reasons that mean "the run finished on its own terms, wrap it up gracefully" —
// get a final-summary cycle before stopping, rather than an abrupt halt.
// (rate_limit/fatal_error are not graceful completions and skip straight to
// stopProject.)
const TIME_BASED_STOP_REASONS = new Set([
  'time_budget',
  'hours_exhausted',
  'deadline',
  'fast_mode_done',
  'auto_done',
  'auto_cycle_cap',
]);

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function itersPerClaim() {
  const n = Number(process.env.WORKER_ITERS_PER_CLAIM || 5);
  return Number.isFinite(n) && n > 0 ? Math.min(20, Math.floor(n)) : 5;
}

// Fast mode: do the smallest useful amount of work and stop — a low fixed
// cycle count, independent of wall-clock time, is what "as soon as possible"
// actually means here (a cycle can take anywhere from seconds to minutes).
const FAST_MODE_MAX_CYCLES = envInt('WORKER_FAST_MODE_MAX_CYCLES', 2);

// Auto mode: no timer. Keep going while the orchestrator is still finding real
// next work; stop as soon as it reports the task done. This ceiling exists only
// as a safety net for a run that never calls itself done.
const AUTO_MODE_MAX_CYCLES = envInt('WORKER_AUTO_MODE_MAX_CYCLES', 60);

function limitsHit(p, now = new Date()) {
  // Legacy per-date deadline (projects created before the time-budget model).
  if (p.due_at && now > new Date(p.due_at)) {
    return { reason: 'deadline', message: `Due date reached (${p.due_at})` };
  }
  // Legacy allotted-hours field (projects created before the time-budget model).
  if (p.allotted_hours && p.started_at) {
    const elapsedH = (now.getTime() - new Date(p.started_at).getTime()) / (1000 * 60 * 60);
    if (elapsedH >= Number(p.allotted_hours)) {
      return {
        reason: 'hours_exhausted',
        message: `Allotted ${p.allotted_hours}h reached (elapsed ~${elapsedH.toFixed(2)}h)`,
      };
    }
  }
  // Duration-budget model: a single time cap, 5 minutes to 12 hours. Gated to
  // "timed" mode so a leftover value from before a mode switch can't quietly
  // cut a fast/auto run short.
  const mode = p.budget_mode || 'timed';
  if (mode === 'timed' && p.time_budget_minutes && p.started_at) {
    const elapsedMin = (now.getTime() - new Date(p.started_at).getTime()) / 60000;
    if (elapsedMin >= Number(p.time_budget_minutes)) {
      return {
        reason: 'time_budget',
        message: `Time budget of ${p.time_budget_minutes}m reached (elapsed ~${elapsedMin.toFixed(1)}m)`,
      };
    }
  }

  // Fast: minimal scope, done as soon as possible — a small fixed cycle count
  // rather than a clock, since "fast" here means least work, not least time.
  if (mode === 'fast' && Number(p.agent_iteration || 0) >= FAST_MODE_MAX_CYCLES) {
    return {
      reason: 'fast_mode_done',
      message: `Fast mode: wrapping up after ${p.agent_iteration} cycle(s)`,
    };
  }

  // Auto: no timer. Stop when the orchestrator itself reports the task done —
  // checkpoint.status carries the last cycle's self-reported status — or, if it
  // never does, when the cycle ceiling below is reached instead.
  if (mode === 'auto') {
    if (p.checkpoint?.status === 'done') {
      return {
        reason: 'auto_done',
        message: 'Auto mode: the agent reported the task is complete',
      };
    }
    if (Number(p.agent_iteration || 0) >= AUTO_MODE_MAX_CYCLES) {
      return {
        reason: 'auto_cycle_cap',
        message: `Auto mode: reached the ${AUTO_MODE_MAX_CYCLES}-cycle ceiling without a clean finish`,
      };
    }
  }

  // Token budget is intentionally NOT a stop condition — tokens are still recorded
  // (project.tokens_used, project_agent_events.tokens_used) for cost visibility in
  // Settings, but only the time budget / cycle caps / user Stop / rate limit end a
  // project now.
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
      if (TIME_BASED_STOP_REASONS.has(hard.reason)) {
        await wrapUpAndStop(client, p, hard);
      } else {
        await stopProject(client, p, hard.reason, hard.message, 'paused');
      }
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
        if (TIME_BASED_STOP_REASONS.has(hit.reason)) {
          await wrapUpAndStop(client, p, hit);
        } else {
          await stopProject(client, p, hit.reason, hit.message, 'paused');
        }
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

      // Mid-project steering: pick up any chat messages the user sent since the last cycle.
      // Marked consumed immediately so each one is delivered as "new" exactly once — it keeps
      // being remembered afterward via checkpoint.memory.user_instructions (see buildMemory).
      const pendingMsgRes = await client.query(
        `SELECT id, content FROM project_messages
         WHERE project_id = $1 AND role = 'user' AND consumed_at IS NULL
         ORDER BY created_at ASC LIMIT 20`,
        [p.id]
      );
      const pendingUserInstructions = pendingMsgRes.rows.map((r) => r.content);
      if (pendingMsgRes.rows.length) {
        await client.query(
          `UPDATE project_messages SET consumed_at = now() WHERE id = ANY($1::uuid[])`,
          [pendingMsgRes.rows.map((r) => r.id)]
        );
      }

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

      const subAgentPool = await prepareSubAgentPool(client, p.org_id);

      const started = Date.now();
      let result;
      try {
        result = await runOrchestratorCycle(
          { ...p, checkpoint: mergeCheckpoint(p.checkpoint, { cycle }) },
          {
          step: cycle,
          fileNames,
          subAgentPool,
          pendingUserInstructions,
          subAgentKeyOps: {
            markUsed: (keyId) => markKeyUsed(client, keyId),
            markUnhealthy: (keyId, err) => markKeyUnhealthy(client, keyId, err),
          },
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
      } catch (err) {
        // An unexpected throw (bug, malformed provider response, etc.) must not leave the
        // project silently claimed and stuck for the 5-minute staleness window with zero
        // visibility — route it through the existing fatal_error path so it's paused and
        // surfaced to the user instead.
        console.error('[Worker] orchestrator cycle threw', err);
        result = {
          status: 'blocked',
          summary: null,
          tokens: 0,
          progress_pct: null,
          next_focus: null,
          outputs: [],
          mode: 'openrouter',
          logs: [],
          error: { code: 'fatal_error', message: err.message, stage: 'orchestrator_exception' },
          rateLimited: false,
          sub_ok: undefined,
          sub_fail: undefined,
          review: null,
        };
      }
      const duration = Date.now() - started;

      // First-ever cycle: capture the initial plan (agenda + sub-agent allocation) as
      // a distinct, human-readable "kickoff plan" the UI can show up front, separate
      // from the ongoing rolling checkpoint.
      if (cycle === 1 && !p.kickoff_plan && result.plan) {
        const kickoffPlan = [
          result.plan.summary ? `**Agenda:** ${result.plan.summary}` : null,
          Array.isArray(result.plan.subtasks) && result.plan.subtasks.length
            ? `**Sub-agent tasks planned:**\n${result.plan.subtasks
                .map((t, i) => `${i + 1}. [${t.role}] ${t.prompt}`)
                .join('\n')}`
            : null,
          result.plan.next_focus ? `**Next focus:** ${result.plan.next_focus}` : null,
        ]
          .filter(Boolean)
          .join('\n\n');
        if (kickoffPlan) {
          await client.query(`UPDATE projects SET kickoff_plan = $2 WHERE id = $1`, [p.id, kickoffPlan]);
        }
      }

      // Rate limit on main orchestrator only — sub-agents rotate/fallback instead of pausing
      if (result.rateLimited && result.error?.stage !== 'sub_agents') {
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

      const memory = buildMemory(p.checkpoint, result, pendingUserInstructions);
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
        `Took ${Math.round(duration / 1000)}s · +${result.tokens || 0} tok (${updated.tokens_used} total) · progress ${metrics.progressPct}%`,
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

      // In "timed" mode a soft agent "done" does NOT stop — keep looping until
      // the timer runs out. In "auto" mode it does: limitsHit() below reads
      // checkpoint.status straight off this patch.
      p = { ...p, tokens_used: updated.tokens_used, progress_pct: metrics.progressPct, checkpoint: checkpointPatch };

      const after = limitsHit(p);
      if (after) {
        if (TIME_BASED_STOP_REASONS.has(after.reason)) {
          await wrapUpAndStop(client, p, after, metrics.progressPct);
        } else {
          await stopProject(client, p, after.reason, after.message, 'paused', metrics.progressPct);
          await chatNote(client, p, `**Stopped — ${after.reason}**\n${after.message}`);
        }
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
      detail: `WORKER_ITERS_PER_CLAIM=${maxIters}. Still running until time budget / stop / rate limit.`,
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

function buildMemory(checkpoint, result, newUserInstructions = []) {
  const prev = mergeCheckpoint(checkpoint).memory || {};
  const ideas = [
    ...(Array.isArray(prev.idea_backlog) ? prev.idea_backlog : []),
    ...(result.review?.new_ideas || []),
  ].slice(-20);
  // User steering notes persist here so the agent keeps acting on them across every future
  // cycle, not just the one where they arrived (see contextBlock in orchestrator.js).
  const userInstructions = [
    ...(Array.isArray(prev.user_instructions) ? prev.user_instructions : []),
    ...newUserInstructions,
  ].slice(-20);
  return {
    last_critique: result.review?.critique || prev.last_critique || null,
    idea_backlog: ideas,
    user_instructions: userInstructions,
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

/**
 * The run finished on its own terms — time budget, fast/auto cycle cap, or the
 * agent calling itself done. Run one focused wrap-up cycle that turns everything
 * done so far into a final summary document, then stop — instead of just
 * halting mid-thought.
 */
async function wrapUpAndStop(client, p, hit, progressPct = null) {
  const cycle = Number(p.agent_iteration || 0) + 1;
  await writeCheckpoint(client, p.id, {
    stage: 'saving',
    detail: `${hit.message} — wrapping up with a final summary`,
    cycle,
  });
  await recordEvent(client, {
    projectId: p.id,
    orgId: p.org_id,
    cycle,
    stage: 'control',
    action: 'wrap_up_start',
    status: 'started',
    summary: `${hit.message} — generating final summary`,
    detail: hit.message,
  });

  let result = null;
  try {
    result = await runWrapUpCycle(p, { step: cycle });
  } catch (err) {
    await recordEvent(client, {
      projectId: p.id,
      orgId: p.org_id,
      cycle,
      stage: 'control',
      action: 'wrap_up_error',
      status: 'error',
      summary: `Wrap-up failed: ${err.message}`,
      errorFull: err.body || err.message,
    });
  }

  if (result?.tokens) {
    await client.query(
      `UPDATE projects SET tokens_used = tokens_used + $2, updated_at = now() WHERE id = $1`,
      [p.id, result.tokens]
    );
  }
  if (result?.summary) {
    await chatNote(client, p, `**Final summary**\n${result.summary}`);
  }
  for (const out of result?.outputs || []) {
    await stageDoc(client, p, out);
  }

  await recordEvent(client, {
    projectId: p.id,
    orgId: p.org_id,
    cycle,
    stage: 'control',
    action: 'wrap_up_done',
    status: 'ok',
    summary: result ? 'Wrap-up complete' : 'Wrap-up skipped (error above)',
    tokensUsed: result?.tokens || 0,
  });

  await stopProject(client, p, hit.reason, hit.message, 'completed', progressPct ?? 100);
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
