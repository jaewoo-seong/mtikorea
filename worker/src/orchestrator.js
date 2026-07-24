const { chat, getMainModel, hasApiKey } = require('./llm/openrouter');
const { callProvider, isAuthFailure } = require('./llm/providers');
const { buildSubAgentCandidates, ensureEnvOpenRouterHealthy } = require('./lib/keyPool');
const { parseAgentJson, normalizePlan } = require('./parseAgentJson');
const { globalSubAgentSemaphore } = require('./lib/semaphore');

const ROLES = ['researcher', 'drafter', 'critic'];

// Per-project, per-cycle cap on parallel sub-agents. A separate process-wide
// semaphore (globalSubAgentSemaphore) additionally caps total concurrent
// sub-agent calls across every project this worker is running at once.
function subConcurrency() {
  const n = Number(process.env.WORKER_SUBAGENT_CONCURRENCY || 10);
  return Number.isFinite(n) && n > 0 ? Math.min(10, Math.floor(n)) : 10;
}

function roleForIndex(index, preferred) {
  if (preferred && ROLES.includes(String(preferred).toLowerCase())) {
    return String(preferred).toLowerCase();
  }
  return ROLES[index % ROLES.length];
}

function displayModelForTarget(target) {
  return target.provider === 'openrouter' ? target.model : `${target.provider}/${target.model}`;
}

/**
 * Try admin pool entries then env OpenRouter fallbacks. Auth failures mark the
 * key unhealthy and rotate; rate limits and transient errors also rotate without
 * stopping the project — the main agent synthesizes partial/failed sub output.
 */
async function runSubTaskWithFallback({
  task,
  idx,
  pool,
  subAgentKeyOps,
  project,
  memoryBlock,
  role,
  onRetry,
  onProgress,
  onEvent,
}) {
  const candidates = buildSubAgentCandidates(pool, idx);
  const errors = [];

  for (const target of candidates) {
    if (target.source === 'env') {
      const envOk = await ensureEnvOpenRouterHealthy();
      if (!envOk) {
        errors.push(`env OpenRouter: ${process.env.OPENROUTER_API_KEY ? 'auth check failed' : 'no key'}`);
        continue;
      }
    }

    const displayModel = displayModelForTarget(target);
    const t0 = Date.now();
    await onProgress({
      stage: 'sub_agents',
      detail: `${role} → ${displayModel}${errors.length ? ' (fallback)' : ''}`,
      mode: 'openrouter',
      current_sub: { role, model: displayModel, index: idx + 1, of: task._of, fallback: errors.length > 0 },
    });

    try {
      const res = await globalSubAgentSemaphore.run(() =>
        callProvider({
          provider: target.provider,
          apiKey: target.apiKey,
          model: target.model,
          maxTokens: 900,
          temperature: 0.5,
          messages: [
            {
              role: 'system',
              content: `You are a free ${role} sub-agent for an MTI project. Be concrete and useful. No JSON required — return markdown or plain text.`,
            },
            {
              role: 'user',
              content: [
                `Project: ${project.title}`,
                `Goal: ${project.goal || 'n/a'}`,
                memoryBlock,
                `Your role: ${role}`,
                `Expect: ${task.expect || 'helpful output'}`,
                `Task:\n${task.prompt}`,
              ].join('\n'),
            },
          ],
          onRetry,
        })
      );

      if (target.keyId && subAgentKeyOps?.markUsed) {
        await subAgentKeyOps.markUsed(target.keyId);
      }

      await onEvent({
        stage: 'sub_agents',
        action: 'ok',
        status: 'ok',
        summary: `${role} finished${errors.length ? ' (after fallback)' : ''}`,
        detail: res.content,
        model: displayModel,
        role,
        tokensUsed: res.tokens,
        durationMs: Date.now() - t0,
      });

      return {
        role,
        model: displayModel,
        ok: true,
        content: res.content,
        tokens: res.tokens,
        fallbacksTried: errors.length,
      };
    } catch (err) {
      const detail = err.body || err.message;
      errors.push(`${displayModel}: ${err.message}`);

      if (isAuthFailure(err) && target.keyId && subAgentKeyOps?.markUnhealthy) {
        await subAgentKeyOps.markUnhealthy(target.keyId, err);
      }

      await onEvent({
        stage: 'sub_agents',
        action: isAuthFailure(err) ? 'auth_fail_rotate' : 'error_rotate',
        status: 'error',
        summary: `${role} failed on ${displayModel}, trying next`,
        detail: err.message,
        errorFull: detail,
        model: displayModel,
        role,
        durationMs: Date.now() - t0,
      });
    }
  }

  const summary = errors.length
    ? `All sub-agent targets failed (${errors.length} tried)`
    : 'No sub-agent targets configured';

  await onEvent({
    stage: 'sub_agents',
    action: 'exhausted',
    status: 'error',
    summary,
    detail: errors.join('\n'),
    role,
  });

  return {
    role,
    model: 'none',
    ok: false,
    content: summary,
    tokens: 20,
    exhausted: true,
    errors,
  };
}

const PLAN_SYSTEM = `You are the MAIN orchestrator for an MTI CRM project worker in a continuous improvement loop.
You plan work, decide deliverables, and dispatch short jobs to free sub-agents.
Reply with ONLY valid JSON:
{
  "status": "continue" | "deliverable_ready" | "blocked" | "done",
  "progress_pct": 0-100,
  "summary": "short user-facing progress update",
  "next_focus": "what to do this/next cycle",
  "subtasks": [{ "role": "researcher|drafter|critic", "prompt": "...", "expect": "..." }],
  "outputs": []
}
Rules:
- Spawn 1-3 subtasks free models can finish this cycle.
- Use prior critiques and new_ideas from memory — go back, rethink, invent new angles.
- Soft "done"/"deliverable_ready" means quality is high for this slice; the worker STILL keeps looping until the time budget runs out — keep inventing useful next work.
- Leave outputs empty on plan; synthesis may emit docs.`;

const SYNTH_SYSTEM = `You are the MAIN orchestrator synthesizing sub-agent results.
Reply with ONLY valid JSON:
{
  "status": "continue" | "deliverable_ready" | "blocked" | "done",
  "progress_pct": 0-100,
  "summary": "chat message for the user",
  "next_focus": "next cycle focus",
  "subtasks": [],
  "outputs": [{ "title": "Document title / ID", "content_markdown": "full markdown body" }]
}
Rules:
- Include outputs when a real document should be staged for human approval.
- Merge strongest sub-agent material; do not invent citations.`;

const REVIEW_SYSTEM = `You are the MAIN orchestrator reviewing the last cycle so the worker can rethink and improve.
Reply with ONLY valid JSON:
{
  "critique": "what was weak or missing",
  "new_ideas": ["idea1", "idea2"],
  "go_back_to": "plan" | "subs" | "none",
  "progress_pct": 0-100,
  "summary": "review summary for the user",
  "status": "continue" | "deliverable_ready" | "blocked" | "done"
}
Rules:
- Prefer continue with new ideas until the human stops or budget ends.
- go_back_to=plan means next iteration should replan heavily; subs means refine with more free agents.`;

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function normalizeReview(raw) {
  const parsed = parseAgentJson(raw, { status: 'continue' });
  const go = ['plan', 'subs', 'none'].includes(parsed.go_back_to) ? parsed.go_back_to : 'plan';
  let progress = Number(parsed.progress_pct);
  if (!Number.isFinite(progress)) progress = null;
  else progress = Math.max(0, Math.min(100, progress));
  const ideas = Array.isArray(parsed.new_ideas)
    ? parsed.new_ideas.map((x) => String(x).slice(0, 500)).filter(Boolean).slice(0, 8)
    : [];
  return {
    critique: String(parsed.critique || '').slice(0, 4000),
    new_ideas: ideas,
    go_back_to: go,
    progress_pct: progress,
    summary: String(parsed.summary || parsed.critique || 'Review complete').slice(0, 4000),
    status: ['continue', 'deliverable_ready', 'blocked', 'done'].includes(parsed.status)
      ? parsed.status
      : 'continue',
    _parseError: parsed._parseError || null,
  };
}

/**
 * One orchestrator iteration: plan → subs → synth → review.
 */
async function runOrchestratorCycle(project, context = {}) {
  const step = context.step || 1;
  const fileNames = context.fileNames || [];
  const recentLog = context.recentLog || [];
  const subAgentPool = context.subAgentPool || [];
  const subAgentKeyOps = context.subAgentKeyOps || null;
  const checkpoint = project.checkpoint || {};
  const memory = checkpoint.memory || {};
  const onProgress = typeof context.onProgress === 'function' ? context.onProgress : async () => {};
  const onEvent = typeof context.onEvent === 'function' ? context.onEvent : async () => {};

  const budgetMode = project.budget_mode || 'timed';
  const scheduleNote = [
    `Budget mode: ${budgetMode}`,
    project.time_budget_minutes != null ? `Time budget: ${project.time_budget_minutes}m` : null,
    project.allotted_hours != null ? `Allotted hours: ${project.allotted_hours} (legacy)` : null,
    project.due_at ? `Due: ${project.due_at}` : null,
    project.token_budget != null ? `Tokens: ${project.tokens_used}/${project.token_budget}` : `Tokens used so far: ${project.tokens_used} (no cap)`,
  ]
    .filter(Boolean)
    .join(' · ');

  // Only fast/auto need an explicit behavioral override — "timed" is the
  // default the static system prompts already assume (keep inventing work
  // until the clock runs out).
  const budgetModeInstruction =
    budgetMode === 'fast'
      ? 'IMPORTANT — FAST MODE: Do the smallest amount of genuinely useful work that satisfies the goal, then report status "done". Skip broad exploration; spawn at most 1 subtask only if truly necessary, otherwise none. This cycle (or the next) should be your last.'
      : budgetMode === 'auto'
        ? 'IMPORTANT — AUTO MODE: There is no time limit, but do not pad cycles with filler. Keep improving with genuinely new angles while they exist. The moment you cannot think of anything more valuable to add, report status "done" honestly — that will actually stop the run.'
        : null;

  if (!hasApiKey()) {
    await onProgress({
      stage: 'planning',
      detail: 'No OPENROUTER_API_KEY — local mock iteration',
      mode: 'local',
    });
    await onEvent({
      stage: 'planning',
      action: 'local_mock',
      status: 'ok',
      summary: 'Local mock (no API key)',
      detail: 'Set OPENROUTER_API_KEY on Worker for real agents',
    });
    const local = localCycle(project, step, scheduleNote);
    await onProgress({ stage: 'review', detail: local.summary, mode: 'local', status: local.status });
    return { ...local, mode: 'local', review: { critique: 'local', new_ideas: [], go_back_to: 'plan' } };
  }

  const mainModel = getMainModel();
  const logs = [];
  let totalTokens = 0;
  let error = null;
  let rateLimited = false;

  const pendingUserInstructions = context.pendingUserInstructions || [];

  const memoryBlock = [
    memory.last_critique ? `Last critique: ${memory.last_critique}` : null,
    Array.isArray(memory.idea_backlog) && memory.idea_backlog.length
      ? `Idea backlog: ${memory.idea_backlog.slice(-10).join(' | ')}`
      : null,
    Array.isArray(memory.user_instructions) && memory.user_instructions.length
      ? `Standing user instructions (keep honoring these): ${memory.user_instructions.slice(-10).join(' | ')}`
      : null,
    memory.go_back_to ? `Go back preference: ${memory.go_back_to}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const contextBlock = [
    `Project: ${project.title}`,
    `Goal: ${project.goal || 'n/a'}`,
    `Desired output: ${project.desired_output || '(not specified — use your judgement based on the goal)'}`,
    `Iteration/cycle: ${step}`,
    scheduleNote,
    budgetModeInstruction,
    `Briefing files: ${fileNames.length ? fileNames.join(', ') : '(none)'}`,
    pendingUserInstructions.length
      ? `NEW INSTRUCTION FROM USER (just sent, address this specifically this cycle): ${pendingUserInstructions.join(' | ')}`
      : null,
    memoryBlock || 'Memory: (empty)',
    `Checkpoint: ${JSON.stringify({ ...checkpoint, memory: undefined }).slice(0, 2000)}`,
    `Recent log: ${recentLog.slice(0, 8).join(' | ').slice(0, 2000)}`,
  ]
    .filter(Boolean)
    .join('\n');

  const retryHook = (stage) => async (info) => {
    await onProgress({
      stage: 'waiting_retry',
      detail: `Rate limit — retry ${info.attempt}/${info.retries} in ${info.delay}ms`,
      mode: 'openrouter',
      last_error: info.body?.slice?.(0, 500),
      error_code: 'rate_limit',
    });
    await onEvent({
      stage: 'waiting_retry',
      action: 'rate_limit_backoff',
      status: 'error',
      summary: `Rate limit retry ${info.attempt}`,
      detail: `Waiting ${info.delay}ms`,
      errorFull: info.body,
      model: mainModel,
    });
  };

  // —— PLANNING ——
  await onProgress({
    stage: 'planning',
    detail: `Main ${mainModel} planning iteration ${step}`,
    mode: 'openrouter',
    main_model: mainModel,
  });
  await onEvent({
    stage: 'planning',
    action: 'start',
    status: 'started',
    summary: `Planning with ${mainModel}`,
    model: mainModel,
  });

  let planRaw;
  const planStarted = Date.now();
  try {
    planRaw = await chat({
      model: mainModel,
      maxTokens: 1400,
      messages: [
        { role: 'system', content: PLAN_SYSTEM },
        { role: 'user', content: contextBlock },
      ],
      onRetry: retryHook('planning'),
    });
  } catch (err) {
    rateLimited = Boolean(err.rateLimited);
    error = { code: err.code || 'llm_error', message: err.message, body: err.body, stage: 'planning' };
    await onEvent({
      stage: 'planning',
      action: 'llm_error',
      status: 'error',
      summary: err.message,
      detail: err.message,
      errorFull: err.body || err.message,
      model: mainModel,
      durationMs: Date.now() - planStarted,
    });
    await onProgress({
      stage: 'error',
      detail: err.message,
      last_error: err.body || err.message,
      error_code: err.code,
      mode: 'openrouter',
    });
    return failResult({ error, rateLimited, totalTokens: 40, checkpoint, logs });
  }

  totalTokens += planRaw.tokens;
  const plan = normalizePlan(parseAgentJson(planRaw.content, { status: 'continue' }), step);
  logs.push({
    phase: 'orchestration',
    action: plan._parseError ? 'plan_parse_fallback' : 'plan',
    detail: planRaw.content.slice(0, 4000),
    tokens: planRaw.tokens,
    subAgent: mainModel,
  });
  await onEvent({
    stage: 'planning',
    action: plan._parseError ? 'parse_fallback' : 'ok',
    status: 'ok',
    summary: plan.summary,
    detail: planRaw.content,
    model: mainModel,
    tokensUsed: planRaw.tokens,
    durationMs: Date.now() - planStarted,
  });

  // —— SUB-AGENTS ——
  let subResults = [];
  const subtasks = plan.subtasks.slice(0, subConcurrency());

  if (subtasks.length) {
    await onProgress({
      stage: 'sub_agents',
      detail: `Running ${subtasks.length} free sub-agent(s)`,
      mode: 'openrouter',
      subtask_count: subtasks.length,
      last_summary: plan.summary,
    });
    await onEvent({
      stage: 'sub_agents',
      action: 'start',
      status: 'started',
      summary: `${subtasks.length} subtasks`,
      detail: subtasks.map((t) => `${t.role}: ${t.prompt.slice(0, 200)}`).join('\n'),
    });

    subResults = await mapPool(subtasks, subConcurrency(), async (task, idx) => {
      const role = roleForIndex(idx, task.role);
      task._of = subtasks.length;
      await onEvent({
        stage: 'sub_agents',
        action: 'start',
        status: 'started',
        summary: `${role} started`,
        role,
        detail: task.prompt,
      });

      const result = await runSubTaskWithFallback({
        task,
        idx,
        pool: subAgentPool,
        subAgentKeyOps,
        project,
        memoryBlock,
        role,
        onRetry: retryHook('sub_agents'),
        onProgress,
        onEvent,
      });

      logs.push({
        phase: 'sub_agent_call',
        action: result.ok ? role : `${role}_error`,
        detail: result.content.slice(0, 4000),
        tokens: result.tokens,
        subAgent: result.model,
      });
      totalTokens += result.tokens;
      return result;
    });
  } else {
    await onEvent({
      stage: 'sub_agents',
      action: 'skipped',
      status: 'skipped',
      summary: 'No subtasks from planner',
    });
  }

  const subOk = subResults.filter((r) => r.ok).length;
  const subFail = subResults.filter((r) => !r.ok).length;
  const subDigest = subResults
    .map(
      (r, i) =>
        `### Sub-agent ${i + 1} (${r.role} / ${r.model}) ${r.ok ? 'OK' : 'ERROR'}\n${r.content.slice(0, 2500)}`
    )
    .join('\n\n');

  // —— SYNTHESIS ——
  await onProgress({
    stage: 'synthesis',
    detail: `Main ${mainModel} synthesizing (${subOk} ok / ${subFail} failed)`,
    mode: 'openrouter',
    sub_ok: subOk,
    sub_fail: subFail,
  });
  await onEvent({
    stage: 'synthesis',
    action: 'start',
    status: 'started',
    summary: 'Synthesis started',
    model: mainModel,
  });

  let synthRaw;
  const synthStarted = Date.now();
  try {
    synthRaw = await chat({
      model: mainModel,
      maxTokens: 2200,
      messages: [
        { role: 'system', content: SYNTH_SYSTEM },
        {
          role: 'user',
          content: [
            contextBlock,
            `Plan summary: ${plan.summary}`,
            `Plan status: ${plan.status}`,
            subFail === subResults.length && subResults.length
              ? `WARNING: All ${subResults.length} sub-agent(s) failed after fallback rotation — synthesize from the plan and note what could not be delegated.`
              : null,
            `Sub-agent results:\n${subDigest || '(no sub-agents ran)'}`,
          ].join('\n\n'),
        },
      ],
      onRetry: retryHook('synthesis'),
    });
  } catch (err) {
    rateLimited = Boolean(err.rateLimited);
    error = {
      code: err.code || 'llm_error',
      message: err.message,
      body: err.body,
      stage: 'synthesis',
    };
    await onEvent({
      stage: 'synthesis',
      action: 'llm_error',
      status: 'error',
      summary: err.message,
      errorFull: err.body || err.message,
      model: mainModel,
      durationMs: Date.now() - synthStarted,
    });
    return failResult({
      error,
      rateLimited,
      totalTokens: totalTokens + 40,
      checkpoint,
      logs,
      plan,
      sub_ok: subOk,
      sub_fail: subFail,
    });
  }

  totalTokens += synthRaw.tokens;
  const synth = normalizePlan(
    parseAgentJson(synthRaw.content, {
      status: plan.status,
      progress_pct: plan.progress_pct,
      summary: plan.summary,
    }),
    step
  );
  logs.push({
    phase: 'synthesis',
    action: synth._parseError ? 'synth_parse_fallback' : 'synthesize',
    detail: synthRaw.content.slice(0, 4000),
    tokens: synthRaw.tokens,
    subAgent: mainModel,
  });
  await onEvent({
    stage: 'synthesis',
    action: synth._parseError ? 'parse_fallback' : 'ok',
    status: 'ok',
    summary: synth.summary,
    detail: synthRaw.content,
    model: mainModel,
    tokensUsed: synthRaw.tokens,
    durationMs: Date.now() - synthStarted,
  });

  // —— REVIEW / RETHINK ——
  await onProgress({
    stage: 'review',
    detail: `Main ${mainModel} reviewing — critique + new ideas`,
    mode: 'openrouter',
  });
  await onEvent({
    stage: 'review',
    action: 'start',
    status: 'started',
    summary: 'Review / rethink',
    model: mainModel,
  });

  let review = {
    critique: '',
    new_ideas: [],
    go_back_to: 'plan',
    progress_pct: synth.progress_pct,
    summary: synth.summary,
    status: synth.status || plan.status,
  };
  const reviewStarted = Date.now();
  try {
    const reviewRaw = await chat({
      model: mainModel,
      maxTokens: 1200,
      messages: [
        { role: 'system', content: REVIEW_SYSTEM },
        {
          role: 'user',
          content: [
            contextBlock,
            `Synth summary: ${synth.summary}`,
            `Outputs count: ${(synth.outputs || []).length}`,
            `Sub digest:\n${subDigest.slice(0, 3000) || '(none)'}`,
          ].join('\n\n'),
        },
      ],
      onRetry: retryHook('review'),
    });
    totalTokens += reviewRaw.tokens;
    review = normalizeReview(reviewRaw.content);
    logs.push({
      phase: 'review',
      action: review._parseError ? 'review_parse_fallback' : 'review',
      detail: reviewRaw.content.slice(0, 4000),
      tokens: reviewRaw.tokens,
      subAgent: mainModel,
    });
    await onEvent({
      stage: 'review',
      action: review._parseError ? 'parse_fallback' : 'ok',
      status: 'ok',
      summary: review.summary,
      detail: JSON.stringify({
        critique: review.critique,
        new_ideas: review.new_ideas,
        go_back_to: review.go_back_to,
        status: review.status,
      }),
      model: mainModel,
      tokensUsed: reviewRaw.tokens,
      durationMs: Date.now() - reviewStarted,
    });
  } catch (err) {
    rateLimited = Boolean(err.rateLimited);
    error = error || {
      code: err.code || 'llm_error',
      message: err.message,
      body: err.body,
      stage: 'review',
    };
    await onEvent({
      stage: 'review',
      action: 'llm_error',
      status: 'error',
      summary: err.message,
      errorFull: err.body || err.message,
      model: mainModel,
      durationMs: Date.now() - reviewStarted,
    });
    if (rateLimited) {
      return failResult({
        error,
        rateLimited,
        totalTokens: totalTokens + 40,
        checkpoint,
        logs,
        plan,
        synth,
        sub_ok: subOk,
        sub_fail: subFail,
      });
    }
  }

  const status = review.status || synth.status || plan.status;
  const progress_pct =
    review.progress_pct != null
      ? review.progress_pct
      : synth.progress_pct != null
        ? synth.progress_pct
        : plan.progress_pct;

  await onProgress({
    stage: 'saving',
    detail: review.summary || synth.summary,
    last_summary: review.summary || synth.summary,
    next_focus: synth.next_focus || plan.next_focus,
    status,
    mode: 'openrouter',
    last_error: error?.message || null,
  });

  return {
    status,
    summary: review.summary || synth.summary || plan.summary,
    detail: review.summary || synth.summary,
    tokens: totalTokens,
    progress_pct,
    next_focus: synth.next_focus || plan.next_focus,
    outputs: synth.outputs,
    mode: 'openrouter',
    logs,
    error,
    rateLimited,
    sub_ok: subOk,
    sub_fail: subFail,
    review,
    plan: {
      summary: plan.summary,
      subtasks: plan.subtasks,
      next_focus: plan.next_focus,
      status: plan.status,
    },
  };
}

const WRAPUP_SYSTEM = `You are the MAIN orchestrator wrapping up a project because its time budget has been reached.
Reply with ONLY valid JSON:
{
  "summary": "clear, complete summary of everything accomplished this session, written for the human stakeholder",
  "outputs": [{ "title": "...", "content_markdown": "..." }]
}
Rules:
- Always include exactly one output: a final wrap-up document summarizing what was done, key findings/drafts produced, and suggested next steps.
- Be concrete — reference actual work from the checkpoint/memory context provided, not generic filler.
- If a "Desired output" was specified, shape the wrap-up document to match it as closely as possible given what was actually produced.`;

/**
 * Runs once when a project's time budget is reached, instead of stopping abruptly:
 * one focused LLM call that turns everything done so far into a final summary
 * document, staged for approval like any other output.
 */
async function runWrapUpCycle(project, context = {}) {
  const step = context.step || 1;
  const checkpoint = project.checkpoint || {};
  const memory = checkpoint.memory || {};

  if (!hasApiKey()) {
    return {
      summary: `Local mock wrap-up for "${project.title}" after ${step} iteration(s). Set OPENROUTER_API_KEY for a real summary.`,
      outputs: [
        {
          title: `Final summary · ${project.title}`,
          content_markdown: `# Final summary\n\nProject: ${project.title}\nGoal: ${project.goal || 'n/a'}\n\n(Local mode — set OPENROUTER_API_KEY on the Worker for a real wrap-up.)\n`,
        },
      ],
      tokens: 40,
    };
  }

  const mainModel = getMainModel();
  const contextBlock = [
    `Project: ${project.title}`,
    `Goal: ${project.goal || 'n/a'}`,
    `Desired output: ${project.desired_output || '(not specified — use your judgement)'}`,
    memory.last_critique ? `Last critique: ${memory.last_critique}` : null,
    Array.isArray(memory.idea_backlog) && memory.idea_backlog.length
      ? `Idea backlog: ${memory.idea_backlog.slice(-10).join(' | ')}`
      : null,
    Array.isArray(memory.user_instructions) && memory.user_instructions.length
      ? `User instructions given mid-project (make sure the summary/outputs honor these): ${memory.user_instructions.slice(-10).join(' | ')}`
      : null,
    `Checkpoint: ${JSON.stringify({ ...checkpoint, memory: undefined }).slice(0, 2500)}`,
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await chat({
    model: mainModel,
    maxTokens: 2200,
    messages: [
      { role: 'system', content: WRAPUP_SYSTEM },
      { role: 'user', content: contextBlock },
    ],
  });
  const parsed = parseAgentJson(raw.content, { summary: 'Wrap-up complete.', outputs: [] });
  return {
    summary: String(parsed.summary || 'Wrap-up complete.').slice(0, 4000),
    outputs: Array.isArray(parsed.outputs)
      ? parsed.outputs.filter((o) => o?.title && o?.content_markdown)
      : [],
    tokens: raw.tokens,
  };
}

function failResult({
  error,
  rateLimited,
  totalTokens,
  checkpoint,
  logs,
  plan,
  synth,
  sub_ok,
  sub_fail,
}) {
  return {
    status: 'blocked',
    summary: plan?.summary || null,
    detail: error?.message,
    tokens: totalTokens,
    progress_pct: plan?.progress_pct ?? synth?.progress_pct ?? null,
    next_focus: checkpoint?.next_focus || plan?.next_focus || null,
    outputs: [],
    mode: 'openrouter',
    logs: logs || [],
    error,
    rateLimited,
    sub_ok,
    sub_fail,
    review: null,
  };
}

function localCycle(project, step, scheduleNote) {
  const progress = Math.min(95, 10 + step * 8);
  // Local/no-API-key mode still needs to demonstrate fast/auto stopping —
  // "continue" forever would only ever be caught by auto's cycle-cap safety
  // net, never its "done" path. Fast wraps up on its last allowed cycle; auto
  // calls it done after a few mock iterations.
  const mode = project.budget_mode || 'timed';
  const status = (mode === 'fast' && step >= 2) || (mode === 'auto' && step >= 3) ? 'done' : 'continue';
  return {
    status,
    summary: `Local iteration ${step} on "${project.title}". ${scheduleNote}. Set OPENROUTER_API_KEY for real loop.`,
    detail: `Local plan → subs → synth → review`,
    tokens: 60 + step * 10,
    progress_pct: progress,
    next_focus: `Continue goal work for ${project.title}`,
    mode: 'local',
    outputs:
      step % 3 === 0
        ? [
            {
              title: `Local draft · ${project.title} · iter ${step}`,
              content_markdown: `# Local draft\n\nIteration ${step}\n\nGoal: ${project.goal || 'n/a'}\n`,
            },
          ]
        : [],
    logs: [
      {
        phase: 'orchestration',
        action: 'local_plan',
        detail: `Local plan ${step}`,
        tokens: 20,
        subAgent: 'local-main',
      },
      {
        phase: 'sub_agent_call',
        action: 'local_sub',
        detail: 'Local free-sub simulation',
        tokens: 20,
        subAgent: 'local-sub',
      },
      {
        phase: 'synthesis',
        action: 'local_synth',
        detail: `Local synth ${step}`,
        tokens: 10,
        subAgent: 'local-main',
      },
      {
        phase: 'review',
        action: 'local_review',
        detail: 'Local review — keep looping until budget',
        tokens: 10,
        subAgent: 'local-main',
      },
    ],
    error: null,
    rateLimited: false,
    review: {
      critique: 'local mock',
      new_ideas: [`Iterate further on ${project.title}`],
      go_back_to: 'plan',
      summary: 'Local review',
      status: 'continue',
    },
  };
}

module.exports = {
  runOrchestratorCycle,
  runWrapUpCycle,
  parseAgentJson,
  normalizePlan,
};
