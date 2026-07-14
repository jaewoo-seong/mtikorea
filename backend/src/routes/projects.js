const express = require('express');
const multer = require('multer');
const { query } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { saveBuffer, resolvePath } = require('../lib/storage');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*, c.name AS client_name,
        (SELECT COUNT(*)::int FROM agent_work_log w WHERE w.project_id = p.id) AS log_count
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE p.org_id = $1
       ORDER BY p.updated_at DESC`,
      [req.user.org_id]
    );
    res.json({ projects: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM projects WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const files = await query(
      'SELECT id, filename, mime_type, size_bytes, created_at FROM project_files WHERE project_id = $1',
      [req.params.id]
    );
    const logs = await query(
      'SELECT * FROM agent_work_log WHERE project_id = $1 ORDER BY step_number ASC',
      [req.params.id]
    );
    const results = await query(
      'SELECT * FROM agent_task_results WHERE project_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({
      project: rows[0],
      files: files.rows,
      logs: logs.rows,
      results: results.rows,
    });
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
      const st = await query('SELECT status, tokens_used, token_budget FROM projects WHERE id = $1', [
        req.params.id,
      ]);
      res.write(`event: status\ndata: ${JSON.stringify(st.rows[0])}\n\n`);
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

router.post('/', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { title, goal, clientId, tokenBudget } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const { rows } = await query(
      `INSERT INTO projects (org_id, client_id, title, goal, token_budget, created_by, status)
       VALUES ($1,$2,$3,$4,COALESCE($5,50000),$6,'draft') RETURNING *`,
      [req.user.org_id, clientId || null, title, goal || null, tokenBudget || null, req.user.id]
    );
    res.status(201).json({ project: rows[0] });
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
         stopped_at = NULL, claimed_by = NULL, claimed_at = NULL, updated_at = now()
       WHERE id = $1 AND org_id = $2 AND status IN ('draft','paused')
       RETURNING *`,
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) {
      return res.status(409).json({ error: 'Project not startable (must be draft or paused)' });
    }
    await query(
      `INSERT INTO agent_work_log (project_id, step_number, phase, action, detail, tokens_used)
       VALUES ($1, COALESCE((SELECT MAX(step_number) FROM agent_work_log WHERE project_id = $1),0)+1,
               'control', 'start', 'User started project — worker will claim', 0)`,
      [req.params.id]
    );
    res.json({ project: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/stop', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `UPDATE projects SET status = 'paused', stopped_at = now(),
         claimed_by = NULL, claimed_at = NULL, updated_at = now()
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
    res.json({ project: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/complete', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `UPDATE projects SET status = 'completed', completed_at = now(),
         claimed_by = NULL, updated_at = now()
       WHERE id = $1 AND org_id = $2
       RETURNING *`,
      [req.params.id, req.user.org_id]
    );
    res.json({ project: rows[0] });
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
