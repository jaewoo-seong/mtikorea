const express = require('express');
const multer = require('multer');
const { query } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { saveBuffer, resolvePath } = require('../lib/storage');
const { projectProgress } = require('../lib/projectProgress');
const { recordEvent } = require('../lib/agentEvents');
const { cleanPrompt } = require('../lib/llm');

const MIN_TIME_BUDGET_MINUTES = 5;
const MAX_TIME_BUDGET_MINUTES = 720; // 12 hours

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const router = express.Router();
router.use(requireAuth);

function withProgress(row) {
  const metrics = projectProgress(row);
  return { ...row, ...metrics, progress_pct: metrics.progressPct };
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*, c.name AS client_name,
        (SELECT COUNT(*)::int FROM agent_work_log w WHERE w.project_id = p.id) AS log_count,
        (SELECT COUNT(*)::int FROM project_files f WHERE f.project_id = p.id) AS file_count,
        (SELECT COUNT(*)::int FROM agent_task_results r WHERE r.project_id = p.id) AS result_count,
        (SELECT COUNT(*)::int FROM shared_documents d WHERE d.project_id = p.id) AS document_count
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE p.org_id = $1
       ORDER BY p.updated_at DESC`,
      [req.user.org_id]
    );
    res.json({ projects: rows.map(withProgress) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*, c.name AS client_name
       FROM projects p LEFT JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1 AND p.org_id = $2`,
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const project = withProgress(rows[0]);
    await query('UPDATE projects SET progress_pct = $2, updated_at = updated_at WHERE id = $1', [
      project.id,
      project.progressPct,
    ]);

    const files = await query(
      'SELECT id, filename, mime_type, size_bytes, created_at, storage_path FROM project_files WHERE project_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    const docs = await query(
      `SELECT id, title, filename, mime_type, size_bytes, description, created_at, visibility, source, approved_at
       FROM shared_documents WHERE project_id = $1 AND visibility = 'shared' ORDER BY created_at DESC`,
      [req.params.id]
    );
    const staged = await query(
      `SELECT id, title, filename, mime_type, size_bytes, description, created_at, visibility, source
       FROM shared_documents WHERE project_id = $1 AND visibility = 'staged' ORDER BY created_at DESC`,
      [req.params.id]
    );
    const messages = await query(
      `SELECT m.*, d.title AS document_title
       FROM project_messages m
       LEFT JOIN shared_documents d ON d.id = m.document_id
       WHERE m.project_id = $1 ORDER BY m.created_at ASC`,
      [req.params.id]
    );
    const logs = await query(
      'SELECT * FROM agent_work_log WHERE project_id = $1 ORDER BY step_number DESC LIMIT 200',
      [req.params.id]
    );
    const results = await query(
      'SELECT * FROM agent_task_results WHERE project_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    const tasks = await query(
      `SELECT t.*, u.name AS assignee_name
       FROM shared_tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.project_id = $1 AND t.org_id = $2
       ORDER BY t.updated_at DESC`,
      [req.params.id, req.user.org_id]
    );
    const events = await query(
      `SELECT * FROM project_agent_events
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 300`,
      [req.params.id]
    );
    res.json({
      project,
      files: files.rows,
      documents: docs.rows,
      stagedDocuments: staged.rows,
      messages: messages.rows,
      tasks: tasks.rows,
      logs: logs.rows.reverse(),
      results: results.rows,
      events: events.rows,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/events', async (req, res, next) => {
  try {
    const project = await query(
      'SELECT id FROM projects WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (!project.rows[0]) return res.status(404).json({ error: 'Not found' });
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 300));
    const before = req.query.before || null;
    const { rows } = await query(
      `SELECT * FROM project_agent_events
       WHERE project_id = $1
         AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
       ORDER BY created_at DESC
       LIMIT $3`,
      [req.params.id, before, limit]
    );
    res.json({ events: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/logs/stream', async (req, res, next) => {
  try {
    const project = await query(
      'SELECT id, status FROM projects WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (!project.rows[0]) return res.status(404).json({ error: 'Not found' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let lastStep = 0;
    const tick = async () => {
      const logs = await query(
        'SELECT * FROM agent_work_log WHERE project_id = $1 AND step_number > $2 ORDER BY step_number',
        [req.params.id, lastStep]
      );
      for (const row of logs.rows) {
        lastStep = row.step_number;
        res.write(`data: ${JSON.stringify(row)}\n\n`);
      }
      const st = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
      const enriched = withProgress(st.rows[0]);
      res.write(`event: status\ndata: ${JSON.stringify(enriched)}\n\n`);
    };

    await tick();
    const iv = setInterval(() => {
      tick().catch(() => {});
    }, 2000);
    req.on('close', () => clearInterval(iv));
  } catch (err) {
    next(err);
  }
});

router.post('/clean-prompt', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const raw = String(req.body?.rawText || '').trim();
    if (!raw) return res.status(400).json({ error: 'rawText required' });
    const cleanedPrompt = await cleanPrompt(raw);
    res.json({ cleanedPrompt });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { title, goal, clientId, timeBudgetMinutes, desiredOutput } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    let minutes = null;
    if (timeBudgetMinutes != null && timeBudgetMinutes !== '') {
      minutes = Math.round(Number(timeBudgetMinutes));
      if (
        !Number.isFinite(minutes) ||
        minutes < MIN_TIME_BUDGET_MINUTES ||
        minutes > MAX_TIME_BUDGET_MINUTES
      ) {
        return res.status(400).json({
          error: `timeBudgetMinutes must be between ${MIN_TIME_BUDGET_MINUTES} and ${MAX_TIME_BUDGET_MINUTES}`,
        });
      }
    }
    const { rows } = await query(
      `INSERT INTO projects (
         org_id, client_id, title, goal, time_budget_minutes, desired_output, created_by, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft') RETURNING *`,
      [
        req.user.org_id,
        clientId || null,
        title,
        goal || null,
        minutes,
        desiredOutput || null,
        req.user.id,
      ]
    );
    res.status(201).json({ project: withProgress(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const map = {
      title: 'title',
      goal: 'goal',
      clientId: 'client_id',
      tokenBudget: 'token_budget',
      allottedHours: 'allotted_hours',
      dueAt: 'due_at',
      timeBudgetMinutes: 'time_budget_minutes',
      desiredOutput: 'desired_output',
    };
    const updates = [];
    const params = [];
    for (const [key, col] of Object.entries(map)) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key] === '' ? null : req.body[key]);
        updates.push(`${col} = $${params.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    params.push(req.params.id, req.user.org_id);
    const { rows } = await query(
      `UPDATE projects SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${params.length - 1} AND org_id = $${params.length}
       RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ project: withProgress(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/files', upload.array('files', 20), async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const project = await query(
      'SELECT * FROM projects WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (!project.rows[0]) return res.status(404).json({ error: 'Not found' });
    if (project.rows[0].status === 'running') {
      return res.status(409).json({ error: 'Stop project before uploading more files' });
    }
    const created = [];
    for (const file of req.files || []) {
      const saved = saveBuffer(`projects/${req.params.id}`, file.originalname, file.buffer);
      const { rows } = await query(
        `INSERT INTO project_files (project_id, org_id, filename, mime_type, size_bytes, storage_path, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, filename, mime_type, size_bytes, created_at`,
        [
          req.params.id,
          req.user.org_id,
          file.originalname,
          file.mimetype,
          saved.size,
          saved.storagePath,
          req.user.id,
        ]
      );
      // User context uploads stay on project but go to shared when not agent-generated
      await query(
        `INSERT INTO shared_documents (
           org_id, client_id, project_id, title, description, filename, mime_type, size_bytes,
           storage_path, uploaded_by, visibility, source, approved_at, approved_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'shared','upload',now(),$10)`,
        [
          req.user.org_id,
          project.rows[0].client_id,
          req.params.id,
          file.originalname,
          'Project upload',
          file.originalname,
          file.mimetype,
          saved.size,
          saved.storagePath,
          req.user.id,
        ]
      );
      created.push(rows[0]);
    }
    await query('UPDATE projects SET updated_at = now() WHERE id = $1', [req.params.id]);
    res.status(201).json({ files: created });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/start', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `UPDATE projects SET status = 'running', started_at = COALESCE(started_at, now()),
         stopped_at = NULL, stop_reason = NULL, last_error = NULL,
         claimed_by = NULL, claimed_at = NULL, updated_at = now(),
         checkpoint = COALESCE(checkpoint, '{}'::jsonb) || '{"stage":"queued","detail":"User started — waiting for worker claim"}'::jsonb
       WHERE id = $1 AND org_id = $2 AND status IN ('draft','paused')
       RETURNING *`,
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) {
      return res.status(409).json({ error: 'Project not startable (must be draft or paused)' });
    }
    const timeBudgetLabel = rows[0].time_budget_minutes
      ? `${rows[0].time_budget_minutes}m`
      : rows[0].allotted_hours
        ? `${rows[0].allotted_hours}h (legacy)`
        : '∞';
    const detail = `User started. Time budget=${timeBudgetLabel} due=${rows[0].due_at || 'none'}. Loops until time budget / rate limit / Stop, then wraps up with a summary.`;
    await query(
      `INSERT INTO agent_work_log (project_id, step_number, phase, action, detail, tokens_used)
       VALUES ($1, COALESCE((SELECT MAX(step_number) FROM agent_work_log WHERE project_id = $1),0)+1,
               'control', 'start', $2, 0)`,
      [req.params.id, detail]
    );
    await recordEvent(query, {
      projectId: req.params.id,
      orgId: req.user.org_id,
      cycle: rows[0].agent_iteration || 0,
      stage: 'control',
      action: 'start',
      status: 'ok',
      summary: 'User started project',
      detail,
    });
    res.json({ project: withProgress(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/stop', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `UPDATE projects SET status = 'paused', stopped_at = now(),
         stop_reason = 'user_stop', last_error = 'User stopped the project',
         claimed_by = NULL, claimed_at = NULL, updated_at = now(),
         checkpoint = COALESCE(checkpoint, '{}'::jsonb) || '{"stage":"error","detail":"User stopped","stop_reason":"user_stop"}'::jsonb
       WHERE id = $1 AND org_id = $2 AND status = 'running'
       RETURNING *`,
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(409).json({ error: 'Project not running' });
    await query(
      `INSERT INTO agent_work_log (project_id, step_number, phase, action, detail, tokens_used)
       VALUES ($1, COALESCE((SELECT MAX(step_number) FROM agent_work_log WHERE project_id = $1),0)+1,
               'control', 'stop', 'User stopped project', 0)`,
      [req.params.id]
    );
    await recordEvent(query, {
      projectId: req.params.id,
      orgId: req.user.org_id,
      cycle: rows[0].agent_iteration || 0,
      stage: 'control',
      action: 'user_stop',
      status: 'error',
      summary: 'Stopped: user_stop',
      detail: 'User stopped the project',
      errorFull: 'User stopped the project',
    });
    res.json({ project: withProgress(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/complete', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `UPDATE projects SET status = 'completed', completed_at = now(), progress_pct = 100,
         stop_reason = COALESCE(stop_reason, 'user_complete'),
         claimed_by = NULL, updated_at = now()
       WHERE id = $1 AND org_id = $2
       RETURNING *`,
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await recordEvent(query, {
      projectId: req.params.id,
      orgId: req.user.org_id,
      cycle: rows[0].agent_iteration || 0,
      stage: 'control',
      action: 'user_complete',
      status: 'ok',
      summary: 'Marked complete by user',
    });
    res.json({ project: withProgress(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/messages', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const content = (req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: 'content required' });
    const project = await query(
      'SELECT * FROM projects WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (!project.rows[0]) return res.status(404).json({ error: 'Not found' });

    const userMsg = await query(
      `INSERT INTO project_messages (project_id, org_id, role, content)
       VALUES ($1,$2,'user',$3) RETURNING *`,
      [req.params.id, req.user.org_id, content]
    );

    // Lightweight assistant ack — full agent work continues via Start/worker
    const assistant = await query(
      `INSERT INTO project_messages (project_id, org_id, role, content)
       VALUES ($1,$2,'assistant',$3) RETURNING *`,
      [
        req.params.id,
        req.user.org_id,
        project.rows[0].status === 'running'
          ? `Noted. Worker is running in the background and will stage document outputs for approval.\n\nYou said: ${content}`
          : `Noted. Start the worker to process this project in the background. Outputs will appear under Pending approval before Shared docs.\n\nYou said: ${content}`,
      ]
    );

    res.status(201).json({ messages: [userMsg.rows[0], assistant.rows[0]] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    // Clear claim so a mid-cycle worker cannot revive a deleted id via stale claim update
    await query(
      `UPDATE projects SET status = 'paused', claimed_by = NULL, claimed_at = NULL, updated_at = now()
       WHERE id = $1 AND org_id = $2 AND status = 'running'`,
      [req.params.id, req.user.org_id]
    );
    const { rows } = await query(
      `DELETE FROM projects WHERE id = $1 AND org_id = $2 RETURNING id, title`,
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, deleted: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/files/:fileId/download', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT f.* FROM project_files f
       JOIN projects p ON p.id = f.project_id
       WHERE f.id = $1 AND f.project_id = $2 AND p.org_id = $3`,
      [req.params.fileId, req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.download(resolvePath(rows[0].storage_path), rows[0].filename);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
