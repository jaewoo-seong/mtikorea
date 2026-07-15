const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth);

const FIELDS = [
  'name',
  'korean_name',
  'industry',
  'website',
  'email',
  'phone',
  'status',
  'notes',
  'description',
  'profile_markdown',
];

router.get('/', async (req, res, next) => {
  try {
    const { status, q } = req.query;
    const params = [req.user.org_id];
    let sql = `
      SELECT c.*,
        (SELECT COUNT(*)::int FROM shared_documents d WHERE d.client_id = c.id AND d.visibility = 'shared') AS document_count,
        (SELECT COUNT(*)::int FROM projects p WHERE p.client_id = c.id) AS project_count,
        (SELECT COUNT(*)::int FROM shared_tasks t WHERE t.client_id = c.id) AS task_count
      FROM clients c
      WHERE c.org_id = $1`;
    if (status) {
      params.push(status);
      sql += ` AND c.status = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (c.name ILIKE $${params.length} OR c.korean_name ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.industry ILIKE $${params.length})`;
    }
    sql += ' ORDER BY c.updated_at DESC';
    const { rows } = await query(sql, params);
    res.json({ clients: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM clients WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const edits = await query(
      `SELECT e.*, u.name AS editor_name, u.email AS editor_email
       FROM client_edits e LEFT JOIN users u ON u.id = e.edited_by
       WHERE e.client_id = $1 ORDER BY e.edited_at DESC LIMIT 100`,
      [req.params.id]
    );
    const notes = await query(
      `SELECT n.*, u.name AS author_name FROM client_notes n
       LEFT JOIN users u ON u.id = n.created_by
       WHERE n.client_id = $1 ORDER BY n.created_at DESC`,
      [req.params.id]
    );
    const docs = await query(
      `SELECT id, title, filename, mime_type, size_bytes, created_at, project_id, visibility, source
       FROM shared_documents
       WHERE client_id = $1 AND visibility = 'shared'
       ORDER BY created_at DESC`,
      [req.params.id]
    );
    const projects = await query(
      `SELECT id, title, status, progress_pct, due_at, allotted_hours, updated_at
       FROM projects WHERE client_id = $1 ORDER BY updated_at DESC`,
      [req.params.id]
    );
    const emails = await query(
      'SELECT id, subject, from_address, received_at, direction, read FROM emails WHERE client_id = $1 ORDER BY received_at DESC NULLS LAST LIMIT 50',
      [req.params.id]
    );
    const tasks = await query(
      `SELECT t.*, d.title AS document_title
       FROM shared_tasks t
       LEFT JOIN shared_documents d ON d.id = t.document_id
       WHERE t.client_id = $1 ORDER BY t.updated_at DESC`,
      [req.params.id]
    );
    res.json({
      client: rows[0],
      edits: edits.rows,
      notes: notes.rows,
      documents: docs.rows,
      projects: projects.rows,
      emails: emails.rows,
      tasks: tasks.rows,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot create clients' });
    }
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'name required' });
    const { rows } = await query(
      `INSERT INTO clients (org_id, name, korean_name, industry, website, email, phone, status, notes, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'prospect'),$9,$10,$11)
       RETURNING *`,
      [
        req.user.org_id,
        b.name,
        b.korean_name || null,
        b.industry || null,
        b.website || null,
        b.email || null,
        b.phone || null,
        b.status || null,
        b.notes || null,
        b.description || null,
        req.user.id,
      ]
    );
    res.status(201).json({ client: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Client name exists' });
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot edit' });
    }
    const current = await query(
      'SELECT * FROM clients WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (!current.rows[0]) return res.status(404).json({ error: 'Not found' });
    const client = current.rows[0];
    const updates = [];
    const params = [];
    for (const field of FIELDS) {
      if (req.body[field] !== undefined && String(req.body[field]) !== String(client[field] ?? '')) {
        params.push(req.body[field]);
        updates.push(`${field} = $${params.length}`);
        await query(
          `INSERT INTO client_edits (client_id, field_name, old_value, new_value, edited_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            client.id,
            field,
            client[field] != null ? String(client[field]) : null,
            req.body[field] != null ? String(req.body[field]) : null,
            req.user.id,
          ]
        );
      }
    }
    if (!updates.length) return res.json({ client });
    params.push(client.id, req.user.org_id);
    const { rows } = await query(
      `UPDATE clients SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${params.length - 1} AND org_id = $${params.length}
       RETURNING *`,
      params
    );
    res.json({ client: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/notes', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const body = req.body?.body;
    if (!body) return res.status(400).json({ error: 'body required' });
    const client = await query(
      'SELECT id FROM clients WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (!client.rows[0]) return res.status(404).json({ error: 'Not found' });
    const { rows } = await query(
      `INSERT INTO client_notes (client_id, org_id, body, created_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.user.org_id, body, req.user.id]
    );
    res.status(201).json({ note: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    await query('DELETE FROM clients WHERE id = $1 AND org_id = $2', [
      req.params.id,
      req.user.org_id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
