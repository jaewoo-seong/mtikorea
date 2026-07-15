const express = require('express');
const multer = require('multer');
const { query } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { saveBuffer, resolvePath } = require('../lib/storage');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { clientId, projectId, q, visibility } = req.query;
    const params = [req.user.org_id];
    // Default: only approved shared docs (hide staged temp outputs)
    const vis = visibility || 'shared';
    let sql = `
      SELECT d.*, c.name AS client_name, u.name AS uploader_name, p.title AS project_title
      FROM shared_documents d
      LEFT JOIN clients c ON c.id = d.client_id
      LEFT JOIN users u ON u.id = d.uploaded_by
      LEFT JOIN projects p ON p.id = d.project_id
      WHERE d.org_id = $1`;
    if (vis !== 'all') {
      params.push(vis);
      sql += ` AND d.visibility = $${params.length}`;
    }
    if (clientId) {
      params.push(clientId);
      sql += ` AND d.client_id = $${params.length}`;
    }
    if (projectId) {
      params.push(projectId);
      sql += ` AND d.project_id = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (d.title ILIKE $${params.length} OR d.filename ILIKE $${params.length} OR d.description ILIKE $${params.length})`;
    }
    sql += ' ORDER BY d.created_at DESC';
    const { rows } = await query(sql, params);
    res.json({ documents: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    let { title, description, clientId, projectId, visibility } = req.body || {};
    const vis = visibility === 'staged' ? 'staged' : 'shared';

    if (projectId && !clientId) {
      const proj = await query(
        'SELECT client_id FROM projects WHERE id = $1 AND org_id = $2',
        [projectId, req.user.org_id]
      );
      if (proj.rows[0]?.client_id) clientId = proj.rows[0].client_id;
    }

    const folder = vis === 'staged' ? `projects/${projectId || 'temp'}/staged` : 'shared';
    const saved = saveBuffer(folder, req.file.originalname, req.file.buffer);
    const docTitle = title || req.file.originalname;
    const { rows } = await query(
      `INSERT INTO shared_documents (
         org_id, client_id, project_id, title, description, filename, mime_type, size_bytes,
         storage_path, uploaded_by, visibility, source, approved_at, approved_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'upload',$12,$13) RETURNING *`,
      [
        req.user.org_id,
        clientId || null,
        projectId || null,
        docTitle,
        description || null,
        req.file.originalname,
        req.file.mimetype,
        saved.size,
        saved.storagePath,
        req.user.id,
        vis,
        vis === 'shared' ? new Date() : null,
        vis === 'shared' ? req.user.id : null,
      ]
    );
    res.status(201).json({ document: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `UPDATE shared_documents SET
         visibility = 'shared',
         approved_at = now(),
         approved_by = $3,
         updated_at = now()
       WHERE id = $1 AND org_id = $2 AND visibility = 'staged'
       RETURNING *`,
      [req.params.id, req.user.org_id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Staged document not found' });
    res.json({ document: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `DELETE FROM shared_documents WHERE id = $1 AND org_id = $2 AND visibility = 'staged' RETURNING id`,
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Staged document not found' });
    res.json({ ok: true });
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
      clientId: 'client_id',
      projectId: 'project_id',
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
      `UPDATE shared_documents SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${params.length - 1} AND org_id = $${params.length}
       RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ document: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM shared_documents WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.download(resolvePath(rows[0].storage_path), rows[0].filename);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    await query('DELETE FROM shared_documents WHERE id = $1 AND org_id = $2', [
      req.params.id,
      req.user.org_id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
