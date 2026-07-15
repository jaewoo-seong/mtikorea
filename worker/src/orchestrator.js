const { chat, getMainModel, getSubModels, hasApiKey } = require('./llm/openrouter');
const { parseAgentJson, normalizePlan } = require('./parseAgentJson');

const ROLES = ['researcher', 'drafter', 'critic'];

function subConcurrency() {
  const n = Number(process.env.WORKER_SUBAGENT_CONCURRENCY || 3);
  return Number.isFinite(n) && n > 0 ? Math.min(4, Math.floor(n)) : 3;
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

const PLAN_SYSTEM = `You are the MAIN orchestrator for an MTI CRM project worker.
You plan work, decide deliverables, and dispatch short jobs to free sub-agents.
Reply with ONLY valid JSON (no prose outside JSON) matching:
{
  "status": "continue" | "deliverable_ready" | "blocked" | "done",
  "progress_pct": 0-100,
  "summary": "short user-facing progress update",
  "next_focus": "what to do next cycle",
  "subtasks": [{ "role": "researcher|drafter|critic", "prompt": "...", "expect": "..." }],
  "outputs": []
}
Rules:
- Spawn 1-3 subtasks that free models can finish this cycle (research, draft sections, critique).
- Leave outputs empty on the plan step; synthesis will emit documents later if ready.
- Push honest progress_pct based on goal completion, not elapsed time.
- If blocked (missing brief / impossible goal), set status blocked and explain in summary.`;

const SYNTH_SYSTEM = `You are the MAIN orchestrator synthesizing sub-agent results for an MTI CRM project.
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
- Include outputs only when a real document should be staged for human approval.
- Merge the strongest sub-agent material; do not invent citations.
- progress_pct must not decrease without reason; prefer advancing when work landed.`;

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

/**
 * One orchestrator cycle: main plan → free sub-agents → main synth.
 * Without API key, returns a local synthetic cycle.
 */
async function runOrchestratorCycle(project, context = {}) {
  const step = context.step || 1;
  const fileNames = context.fileNames || [];
  const recentLog = context.recentLog || [];
  const checkpoint = project.checkpoint || {};
  const onProgress = typeof context.onProgress === 'function' ? context.onProgress : async () => {};

  const scheduleNote = [
    project.allotted_hours != null ? `Allotted hours: ${project.allotted_hours}` : null,
    project.due_at ? `Due: ${project.due_at}` : null,
    `Tokens: ${project.tokens_used}/${project.token_budget}`,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!hasApiKey()) {
    await onProgress({
      stage: 'planning',
      detail: 'No OPENROUTER_API_KEY — running local mock cycle',
      mode: 'local',
    });
    const local = localCycle(project, step, scheduleNote);
    await onProgress({
      stage: 'idle',
      detail: local.summary,
      mode: 'local',
      status: local.status,
    });
    return { ...local, mode: 'local' };
  }

  const mainModel = getMainModel();
  const logs = [];
  let totalTokens = 0;
  let error = null;

  const contextBlock = [
    `Project: ${project.title}`,
    `Goal: ${project.goal || 'n/a'}`,
    `Step/cycle: ${step}`,
    scheduleNote,
    `Briefing files: ${fileNames.length ? fileNames.join(', ') : '(none)'}`,
    `Checkpoint: ${JSON.stringify(checkpoint).slice(0, 3000)}`,
    `Recent log: ${recentLog.slice(0, 8).join(' | ').slice(0, 2000)}`,
  ].join('\n');

  await onProgress({
    stage: 'planning',
    detail: `Main model ${mainModel} planning cycle ${step}`,
    mode: 'openrouter',
    main_model: mainModel,
  });

  let planRaw;
  try {
    planRaw = await chat({
      model: mainModel,
      maxTokens: 1400,
      messages: [
        { role: 'system', content: PLAN_SYSTEM },
        { role: 'user', content: contextBlock },
      ],
    });
  } catch (err) {
    await onProgress({
      stage: 'error',
      detail: err.message,
      last_error: err.message,
      error_code: err.code || 'llm_error',
      mode: 'openrouter',
    });
    return {
      status: 'blocked',
      summary: null,
      detail: err.message,
      tokens: 40,
      progress_pct: null,
      next_focus: checkpoint.next_focus || null,
      outputs: [],
      mode: 'openrouter',
      logs: [
        {
          phase: 'orchestration',
          action: 'llm_error',
          detail: err.message,
          tokens: 40,
          subAgent: mainModel,
        },
      ],
      error: { code: err.code || 'llm_error', message: err.message },
    };
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

  let subResults = [];
  const subtasks = plan.subtasks.slice(0, subConcurrency());

  if (subtasks.length) {
    await onProgress({
      stage: 'sub_agents',
      detail: `Running ${subtasks.length} free sub-agent(s): ${subtasks.map((t) => t.role || 'agent').join(', ')}`,
      mode: 'openrouter',
      subtask_count: subtasks.length,
      last_summary: plan.summary,
    });
    subResults = await mapPool(subtasks, subConcurrency(), async (task, idx) => {
      const model = pickSubModel(idx);
      const role = roleForIndex(idx, task.role);
      await onProgress({
        stage: 'sub_agents',
        detail: `${role} → ${model}`,
        mode: 'openrouter',
        current_sub: { role, model, index: idx + 1, of: subtasks.length },
      });
      try {
        const res = await chat({
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
                `Your role: ${role}`,
                `Expect: ${task.expect || 'helpful output'}`,
                `Task:\n${task.prompt}`,
              ].join('\n'),
            },
          ],
        });
        logs.push({
          phase: 'sub_agent_call',
          action: role,
          detail: res.content.slice(0, 4000),
          tokens: res.tokens,
          subAgent: model,
        });
        totalTokens += res.tokens;
        return { role, model, ok: true, content: res.content, tokens: res.tokens };
      } catch (err) {
        logs.push({
          phase: 'sub_agent_call',
          action: `${role}_error`,
          detail: err.message,
          tokens: 20,
          subAgent: model,
        });
        totalTokens += 20;
        error = error || { code: err.code || 'sub_agent_error', message: err.message };
        await onProgress({
          stage: 'sub_agents',
          detail: `${role} failed: ${err.message}`,
          last_error: err.message,
          error_code: err.code || 'sub_agent_error',
          mode: 'openrouter',
        });
        return { role, model, ok: false, content: err.message, tokens: 20 };
      }
    });
  } else {
    await onProgress({
      stage: 'sub_agents',
      detail: 'No subtasks from planner — skipping to synthesis',
      mode: 'openrouter',
      last_summary: plan.summary,
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

  await onProgress({
    stage: 'synthesizing',
    detail: `Main ${mainModel} synthesizing (${subOk} ok / ${subFail} failed subs)`,
    mode: 'openrouter',
    sub_ok: subOk,
    sub_fail: subFail,
  });

  let synthRaw;
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
            `Plan progress_pct: ${plan.progress_pct}`,
            `Sub-agent results:\n${subDigest || '(no sub-agents ran)'}`,
          ].join('\n\n'),
        },
      ],
    });
  } catch (err) {
    logs.push({
      phase: 'synthesis',
      action: 'llm_error',
      detail: err.message,
      tokens: 40,
      subAgent: mainModel,
    });
    await onProgress({
      stage: 'error',
      detail: err.message,
      last_error: err.message,
      error_code: err.code || 'llm_error',
      mode: 'openrouter',
    });
    return {
      status: plan.status,
      summary: plan.summary,
      detail: plan.summary,
      tokens: totalTokens + 40,
      progress_pct: plan.progress_pct,
      next_focus: plan.next_focus,
      outputs: [],
      mode: 'openrouter',
      logs,
      error: { code: err.code || 'llm_error', message: err.message },
    };
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

  // Prefer synth outputs; if deliverable_ready but empty, keep empty (don't invent)
  const status = synth.status || plan.status;
  const progress_pct =
    synth.progress_pct != null ? synth.progress_pct : plan.progress_pct;

  const finalStage =
    status === 'blocked' ? 'blocked' : status === 'done' ? 'done' : error ? 'error' : 'idle';

  await onProgress({
    stage: finalStage === 'idle' ? 'persisting' : finalStage,
    detail: synth.summary || plan.summary,
    last_summary: synth.summary || plan.summary,
    next_focus: synth.next_focus || plan.next_focus,
    status,
    mode: 'openrouter',
    last_error: error?.message || null,
    error_code: error?.code || null,
  });

  return {
    status,
    summary: synth.summary || plan.summary,
    detail: synth.summary || plan.summary,
    tokens: totalTokens,
    progress_pct,
    next_focus: synth.next_focus || plan.next_focus,
    outputs: synth.outputs,
    mode: 'openrouter',
    logs,
    error,
    sub_ok: subOk,
    sub_fail: subFail,
  };
}

function localCycle(project, step, scheduleNote) {
  const tags = getSubModels();
  const progress = Math.min(95, 10 + step * 12);
  return {
    status: progress >= 90 ? 'deliverable_ready' : 'continue',
    summary: `Local orchestrator cycle ${step} on "${project.title}". Goal: ${project.goal || '(none)'}. ${scheduleNote}. (Set OPENROUTER_API_KEY for Haiku + free subs.)`,
    detail: `Local plan → fake subs [${tags.slice(0, 2).join(', ')}] → local synth`,
    tokens: 80 + step * 15,
    progress_pct: progress,
    next_focus: `Continue goal work for ${project.title}`,
    mode: 'local',
    outputs:
      step % 2 === 0
        ? [
            {
              title: `Local draft · ${project.title} · cycle ${step}`,
              content_markdown: `# Local draft\n\nStep ${step}\n\nGoal: ${project.goal || 'n/a'}\n`,
            },
          ]
        : [],
    logs: [
      {
        phase: 'orchestration',
        action: 'local_plan',
        detail: `Local plan cycle ${step}`,
        tokens: 40,
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
        detail: `Local synthesis cycle ${step}`,
        tokens: 20,
        subAgent: 'local-main',
      },
    ],
    error: null,
  };
}

module.exports = {
  runOrchestratorCycle,
  parseAgentJson,
  normalizePlan,
};
