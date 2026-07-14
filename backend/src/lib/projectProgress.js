function projectProgress(project, now = new Date()) {
  const tokenPct =
    project.token_budget > 0 ? Number(project.tokens_used || 0) / Number(project.token_budget) : 0;

  let timePct = 0;
  if (project.allotted_hours && project.started_at) {
    const elapsedH =
      (now.getTime() - new Date(project.started_at).getTime()) / (1000 * 60 * 60);
    timePct = elapsedH / Number(project.allotted_hours);
  }

  let duePct = 0;
  if (project.due_at && project.started_at) {
    const start = new Date(project.started_at).getTime();
    const due = new Date(project.due_at).getTime();
    if (due > start) {
      duePct = (now.getTime() - start) / (due - start);
    }
  }

  const raw = Math.max(tokenPct, timePct, duePct, Number(project.progress_pct || 0) / 100);
  const pct = Math.max(0, Math.min(100, Math.round(raw * 1000) / 10));

  return {
    progressPct: pct,
    tokenPct: Math.round(tokenPct * 1000) / 10,
    timePct: Math.round(timePct * 1000) / 10,
    duePct: Math.round(duePct * 1000) / 10,
    overdue: Boolean(project.due_at && now > new Date(project.due_at) && project.status === 'running'),
  };
}

module.exports = { projectProgress };
