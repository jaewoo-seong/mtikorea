const { chat, getMainModel, getSubModels, hasApiKey } = require('./llm/openrouter');
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

function pickSubModel(index) {
  const models = getSubModels();
  return models[index % models.length];
}

function roleForIndex(index, preferred) {
  if (preferred && ROLES.includes(String(preferred).toLowerCase())) {
    return String(preferred).toLowerCase();
  }
  return ROLES[index % ROLES.length];
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
  const checkpoint = project.checkpoint || {};
  const memory = checkpoint.memory || {};
  const onProgress = typeof context.onProgress === 'function' ? context.onProgress : async () => {};
  const onEvent = typeof context.onEvent === 'function' ? context.onEvent : async () => {};

  const scheduleNote = [
    project.time_budget_minutes != null ? `Time budget: ${project.time_budget_minutes}m` : null,
    project.allotted_hours != null ? `Allotted hours: ${project.allotted_hours} (legacy)` : null,
    project.due_at ? `Due: ${project.due_at}` : null,
    project.token_budget != null ? `Tokens: ${project.tokens_used}/${project.token_budget}` : `Tokens used so far: ${project.tokens_used} (no cap)`,
  ]
    .filter(Boolean)
    .join(' · ');

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

  const memoryBlock = [
    memory.last_critique ? `Last critique: ${memory.last_critique}` : null,
    Array.isArray(memory.idea_backlog) && memory.idea_backlog.length
      ? `Idea backlog: ${memory.idea_backlog.slice(-10).join(' | ')}`
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
    `Briefing files: ${fileNames.length ? fileNames.join(', ') : '(none)'}`,
    memoryBlock || 'Memory: (empty)',
    `Checkpoint: ${JSON.stringify({ ...checkpoint, memory: undefined }).slice(0, 2000)}`,
    `Recent log: ${recentLog.slice(0, 8).join(' | ').slice(0, 2000)}`,
  ].join('\n');

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
      const model = pickSubModel(idx);
      const role = roleForIndex(idx, task.role);
      const t0 = Date.now();
      await onProgress({
        stage: 'sub_agents',
        detail: `${role} → ${model}`,
        mode: 'openrouter',
        current_sub: { role, model, index: idx + 1, of: subtasks.length },
      });
      await onEvent({
        stage: 'sub_agents',
        action: 'start',
        status: 'started',
        summary: `${role} started`,
        model,
        role,
        detail: task.prompt,
      });
      try {
        // Global gate: even if many projects each dispatch up to 10 sub-agents at
        // once, only WORKER_GLOBAL_SUBAGENT_CONCURRENCY (default 20) actually run
        // their LLM call at the same instant system-wide — the rest queue here.
        const res = await globalSubAgentSemaphore.run(() =>
          chat({
            model,
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
            onRetry: retryHook('sub_agents'),
          })
        );
        logs.push({
          phase: 'sub_agent_call',
          action: role,
          detail: res.content.slice(0, 4000),
          tokens: res.tokens,
          subAgent: model,
        });
        totalTokens += res.tokens;
        await onEvent({
          stage: 'sub_agents',
          action: 'ok',
          status: 'ok',
          summary: `${role} finished`,
          detail: res.content,
          model,
          role,
          tokensUsed: res.tokens,
          durationMs: Date.now() - t0,
        });
        return { role, model, ok: true, content: res.content, tokens: res.tokens };
      } catch (err) {
        if (err.rateLimited) rateLimited = true;
        error = error || {
          code: err.code || 'sub_agent_error',
          message: err.message,
          body: err.body,
          stage: 'sub_agents',
        };
        logs.push({
          phase: 'sub_agent_call',
          action: `${role}_error`,
          detail: err.message,
          tokens: 20,
          subAgent: model,
        });
        totalTokens += 20;
        await onEvent({
          stage: 'sub_agents',
          action: 'error',
          status: 'error',
          summary: `${role} failed: ${err.message}`,
          detail: err.message,
          errorFull: err.body || err.message,
          model,
          role,
          durationMs: Date.now() - t0,
        });
        return { role, model, ok: false, content: err.message, tokens: 20 };
      }
    });
  } else {
    await onEvent({
      stage: 'sub_agents',
      action: 'skipped',
      status: 'skipped',
      summary: 'No subtasks from planner',
    });
  }

  if (rateLimited && error?.code === 'rate_limit') {
    return failResult({ error, rateLimited, totalTokens, checkpoint, logs, plan });
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
  const tags = getSubModels();
  const progress = Math.min(95, 10 + step * 8);
  return {
    status: 'continue',
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
        subAgent: tags[0] || 'local-sub',
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
