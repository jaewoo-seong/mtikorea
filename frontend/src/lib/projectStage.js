/** Stage labels for continuous orchestrator pipeline. */
export const PIPELINE = [
  { id: 'queued', label: 'Queued' },
  { id: 'planning', label: 'Planning' },
  { id: 'sub_agents', label: 'Sub-agents' },
  { id: 'synthesis', label: 'Synthesis' },
  { id: 'review', label: 'Review' },
  { id: 'saving', label: 'Saving' },
  { id: 'waiting_retry', label: 'Retry wait' },
  { id: 'idle', label: 'Idle' },
  { id: 'error', label: 'Error' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Done' },
];

const ORDER = [
  'queued',
  'planning',
  'sub_agents',
  'synthesis',
  'review',
  'saving',
  'idle',
  'done',
];

export const STOP_LABELS = {
  token_budget: 'Token budget exhausted',
  completed_budget: 'Finished — token budget used',
  hours_exhausted: 'Allotted hours reached',
  deadline: 'Due date reached',
  user_stop: 'Stopped by user',
  user_complete: 'Marked complete by user',
  rate_limit: 'OpenRouter rate limit',
  fatal_error: 'Fatal error',
};

export function checkpointOf(project) {
  const cp = project?.checkpoint;
  if (!cp) return {};
  if (typeof cp === 'string') {
    try {
      return JSON.parse(cp) || {};
    } catch {
      return {};
    }
  }
  return cp;
}

export function stageLabel(stage) {
  return PIPELINE.find((p) => p.id === stage)?.label || (stage ? String(stage) : 'Unknown');
}

export function pipelineIndex(stage) {
  const i = ORDER.indexOf(stage);
  return i >= 0 ? i : -1;
}

export function stopLabel(reason) {
  if (!reason) return null;
  return STOP_LABELS[reason] || reason;
}

export function latestEventStage(events = [], project) {
  const cp = checkpointOf(project);
  if (cp.stage) return cp.stage;
  const e = events[0];
  return e?.stage || (project?.status === 'running' ? 'queued' : 'idle');
}

/** Human diagnostics when things look stuck / broken */
export function buildDiagnostics(project, logs = [], errors = [], events = []) {
  const cp = checkpointOf(project);
  const tips = [];
  const status = project?.status;

  if (project?.stop_reason) {
    tips.push({
      level: 'error',
      text: `Stopped: ${stopLabel(project.stop_reason)}. ${project.last_error || cp.detail || ''}`.trim(),
    });
  }
  if (status === 'draft') {
    tips.push({ level: 'info', text: 'Draft — press Start so the worker can claim this project.' });
  }
  if (status === 'paused' && !project?.stop_reason) {
    tips.push({ level: 'warn', text: 'Paused — Start again to resume the continuous loop.' });
  }
  if (status === 'running') {
    if (!events.length && !logs.length && !cp.stage) {
      tips.push({
        level: 'warn',
        text: 'Running but no events yet. Is the Worker service up with the same DATABASE_URL?',
      });
    }
    if (cp.mode === 'local') {
      tips.push({
        level: 'warn',
        text: 'Local/mock mode — set OPENROUTER_API_KEY on the Worker for Haiku + free subs.',
      });
    }
    if (project.claimed_at) {
      const ageMin = (Date.now() - new Date(project.claimed_at).getTime()) / 60000;
      if (ageMin > 12) {
        tips.push({
          level: 'error',
          text: `Claim held ${Math.round(ageMin)}m — cycle may be stuck or worker crashed.`,
        });
      }
    }
  }
  if (errors.length && !project?.stop_reason) {
    tips.push({
      level: 'error',
      text: errors[errors.length - 1]?.content || 'Recent agent error — open timeline for full body',
    });
  }

  return tips;
}
