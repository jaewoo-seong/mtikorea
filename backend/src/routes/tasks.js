const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { clientId, projectId, status, assigneeId } = req.query;
    const params = [req.user.org_id];
    let sql = `
      SELECT t.*, u.name AS assignee_name, c.name AS client_name, p.title AS project_title,
             d.title AS document_title, d.id AS document_ref
       FROM shared_tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN shared_documents d ON d.id = t.document_id
       WHERE t.org_id = $1`;
    if (clientId) {
      params.push(clientId);
      sql += ` AND t.client_id = $${params.length}`;
    }
    if (projectId) {
      params.push(projectId);
      sql += ` AND t.project_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND t.status = $${params.length}`;
    }
    if (assigneeId) {
      params.push(assigneeId);
      sql += ` AND t.assignee_id = $${params.length}`;
    }
    sql += ' ORDER BY t.updated_at DESC';
    const { rows } = await query(sql, params);
    res.json({ tasks: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    let {
      title,
      description,
      clientId,
      projectId,
      assigneeId,
      dueAt,
      documentId,
      feedbackRequested,
      feedbackNotes,
    } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });

    if (projectId && !clientId) {
      const proj = await query(
        'SELECT client_id FROM projects WHERE id = $1 AND org_id = $2',
        [projectId, req.user.org_id]
      );
      if (proj.rows[0]?.client_id) clientId = proj.rows[0].client_id;
    }
    if (documentId && !clientId) {
      const doc = await query(
        'SELECT client_id, project_id FROM shared_documents WHERE id = $1 AND org_id = $2',
        [documentId, req.user.org_id]
      );
      if (doc.rows[0]) {
        clientId = clientId || doc.rows[0].client_id;
        projectId = projectId || doc.rows[0].project_id;
      }
    }

    const { rows } = await query(
      `INSERT INTO shared_tasks (
         org_id, client_id, project_id, title, description, assignee_id, created_by, due_at,
         document_id, feedback_requested, feedback_notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        req.user.org_id,
        clientId || null,
        projectId || null,
        title,
        description || null,
        assigneeId || null,
        req.user.id,
        dueAt || null,
        documentId || null,
        Boolean(feedbackRequested),
        feedbackNotes || null,
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
    const map = {
      title: 'title',
      description: 'description',
      status: 'status',
      assigneeId: 'assignee_id',
      dueAt: 'due_at',
      clientId: 'client_id',
      projectId: 'project_id',
      documentId: 'document_id',
      feedbackRequested: 'feedback_requested',
      feedbackNotes: 'feedback_notes',
    };
    const updates = [];
    const params = [];
    for (const [key, col] of Object.entries(map)) {
      if (req.body[key] !== undefined) {
        let val = req.body[key] === '' ? null : req.body[key];
        if (key === 'feedbackRequested') val = Boolean(req.body[key]);
        params.push(val);
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

router.get('/:id/comments', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT tc.*, COALESCE(u.name, u.email) AS author_name
       FROM task_comments tc
       LEFT JOIN users u ON u.id = tc.author_id
       WHERE tc.task_id = $1 AND tc.org_id = $2
       ORDER BY tc.created_at ASC`,
      [req.params.id, req.user.org_id]
    );
    res.json({ comments: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/comments', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { body } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: 'body required' });
    const { rows } = await query(
      `INSERT INTO task_comments (task_id, org_id, author_id, body)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, req.user.org_id, req.user.id, body.trim()]
    );
    const author = await query('SELECT COALESCE(name, email) AS author_name FROM users WHERE id = $1', [
      req.user.id,
    ]);
    res.status(201).json({ comment: { ...rows[0], author_name: author.rows[0]?.author_name || null } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `UPDATE shared_tasks SET status = 'done', updated_at = now()
       WHERE id = $1 AND org_id = $2 RETURNING *`,
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ task: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { note } = req.body || {};
    const { rows } = await query(
      `UPDATE shared_tasks SET status = 'open', feedback_notes = $3, updated_at = now()
       WHERE id = $1 AND org_id = $2 RETURNING *`,
      [req.params.id, req.user.org_id, note || null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await query(
      `INSERT INTO task_comments (task_id, org_id, author_id, body)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, req.user.org_id, req.user.id, `Rejected: ${note || '(no note provided)'}`]
    );
    res.json({ task: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
