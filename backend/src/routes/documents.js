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
    const { clientId } = req.query;
    const params = [req.user.org_id];
    let sql = `
      SELECT d.*, c.name AS client_name, u.name AS uploader_name
      FROM shared_documents d
      LEFT JOIN clients c ON c.id = d.client_id
      LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.org_id = $1`;
    if (clientId) {
      params.push(clientId);
      sql += ` AND d.client_id = $${params.length}`;
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
    const { title, description, clientId, projectId } = req.body || {};
    const saved = saveBuffer('shared', req.file.originalname, req.file.buffer);
    const { rows } = await query(
      `INSERT INTO shared_documents (
         org_id, client_id, project_id, title, description, filename, mime_type, size_bytes, storage_path, uploaded_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        req.user.org_id,
        clientId || null,
        projectId || null,
        title || req.file.originalname,
        description || null,
        req.file.originalname,
        req.file.mimetype,
        saved.size,
        saved.storagePath,
        req.user.id,
      ]
    );
    res.status(201).json({ document: rows[0] });
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
