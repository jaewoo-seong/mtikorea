const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT t.*, u.name AS assignee_name, c.name AS client_name
       FROM shared_tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN clients c ON c.id = t.client_id
       WHERE t.org_id = $1
       ORDER BY t.updated_at DESC`,
      [req.user.org_id]
    );
    res.json({ tasks: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { title, description, clientId, projectId, assigneeId, dueAt } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const { rows } = await query(
      `INSERT INTO shared_tasks (
         org_id, client_id, project_id, title, description, assignee_id, created_by, due_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        req.user.org_id,
        clientId || null,
        projectId || null,
        title,
        description || null,
        assigneeId || null,
        req.user.id,
        dueAt || null,
      ]
    );
    res.status(201).json({ task: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const fields = ['title', 'description', 'status', 'assignee_id', 'due_at', 'client_id'];
    const map = {
      title: 'title',
      description: 'description',
      status: 'status',
      assigneeId: 'assignee_id',
      dueAt: 'due_at',
      clientId: 'client_id',
    };
    const updates = [];
    const params = [];
    for (const [key, col] of Object.entries(map)) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key]);
        updates.push(`${col} = $${params.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    params.push(req.params.id, req.user.org_id);
    const { rows } = await query(
      `UPDATE shared_tasks SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${params.length - 1} AND org_id = $${params.length}
       RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ task: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    await query('DELETE FROM shared_tasks WHERE id = $1 AND org_id = $2', [
      req.params.id,
      req.user.org_id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
