/** Stage labels for orchestrator pipeline (checkpoint.stage). */
export const PIPELINE = [
  { id: 'queued', label: 'Queued' },
  { id: 'planning', label: 'Planning' },
  { id: 'sub_agents', label: 'Sub-agents' },
  { id: 'synthesizing', label: 'Synthesis' },
  { id: 'persisting', label: 'Saving' },
  { id: 'idle', label: 'Idle' },
  { id: 'error', label: 'Error' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Done' },
];

const ORDER = ['queued', 'planning', 'sub_agents', 'synthesizing', 'persisting', 'idle', 'done'];

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

/** Human diagnostics when things look stuck / broken */
export function buildDiagnostics(project, logs = [], errors = []) {
  const cp = checkpointOf(project);
  const tips = [];
  const status = project?.status;

  if (status === 'draft') {
    tips.push({ level: 'info', text: 'Draft — press Start so the worker can claim this project.' });
  }
  if (status === 'paused') {
    tips.push({
      level: 'warn',
      text: cp.last_error
        ? `Paused. Last error: ${cp.last_error}`
        : 'Paused — Start again to resume cycles.',
    });
  }
  if (status === 'running') {
    if (!logs.length && !cp.stage) {
      tips.push({
        level: 'warn',
        text: 'Running but no work logged yet. Is the Worker service up? Does it share DATABASE_URL?',
      });
    }
    if (cp.mode === 'local') {
      tips.push({
        level: 'warn',
        text: 'Worker running in local/mock mode — set OPENROUTER_API_KEY on the Worker for real Haiku + free subs.',
      });
    }
    if (project.claimed_at) {
      const ageMin = (Date.now() - new Date(project.claimed_at).getTime()) / 60000;
      if (ageMin > 8) {
        tips.push({
          level: 'error',
          text: `Claim held ${Math.round(ageMin)}m — cycle may be stuck or worker crashed mid-run.`,
        });
      }
    } else if (cp.stage_at) {
      const ageMin = (Date.now() - new Date(cp.stage_at).getTime()) / 60000;
      if (ageMin > 5 && ['planning', 'sub_agents', 'synthesizing'].includes(cp.stage)) {
        tips.push({
          level: 'warn',
          text: `Still reporting “${stageLabel(cp.stage)}” for ${Math.round(ageMin)}m — check Worker logs / OpenRouter rate limits.`,
        });
      }
      if (ageMin > 10 && (cp.stage === 'idle' || !cp.stage)) {
        tips.push({
          level: 'warn',
          text: 'Running but idle more than 10m — worker may not be claiming (redeploy Worker / check concurrency).',
        });
      }
    }
  }
  if (cp.last_error || errors.length) {
    tips.push({
      level: 'error',
      text: cp.last_error || errors[errors.length - 1]?.content || 'Recent agent error',
    });
  }
  if (cp.status === 'blocked') {
    tips.push({
      level: 'warn',
      text: cp.last_summary || 'Agent marked work blocked — check summary / missing brief.',
    });
  }

  return tips;
}
