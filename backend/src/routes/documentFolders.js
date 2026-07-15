const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT f.*, (SELECT COUNT(*)::int FROM shared_documents d WHERE d.folder_id = f.id) AS document_count
       FROM document_folders f WHERE f.org_id = $1 ORDER BY f.name ASC`,
      [req.user.org_id]
    );
    res.json({ folders: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const parentId = req.body?.parentId || null;
    if (parentId) {
      const parent = await query(
        'SELECT id FROM document_folders WHERE id = $1 AND org_id = $2',
        [parentId, req.user.org_id]
      );
      if (!parent.rows[0]) return res.status(404).json({ error: 'Parent folder not found' });
    }
    const { rows } = await query(
      `INSERT INTO document_folders (org_id, parent_id, name, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *, 0 AS document_count`,
      [req.user.org_id, parentId, name, req.user.id]
    );
    res.status(201).json({ folder: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { name, parentId } = req.body || {};
    if (parentId) {
      // Reject moving a folder into itself or into one of its own descendants (would create
      // a cycle that breaks tree rendering — walk up from the target ancestor-by-ancestor).
      let cursor = parentId;
      for (let i = 0; i < 100 && cursor; i++) {
        if (cursor === req.params.id) {
          return res.status(400).json({ error: 'Cannot move a folder into itself or a subfolder of itself' });
        }
        const row = await query('SELECT parent_id FROM document_folders WHERE id = $1', [cursor]);
        cursor = row.rows[0]?.parent_id || null;
      }
    }
    const map = { name: 'name', parentId: 'parent_id' };
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
      `UPDATE document_folders SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${params.length - 1} AND org_id = $${params.length}
       RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ folder: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    // Subfolders cascade (FK ON DELETE CASCADE); documents inside move to root
    // (FK ON DELETE SET NULL) rather than being deleted.
    const { rows } = await query(
      'DELETE FROM document_folders WHERE id = $1 AND org_id = $2 RETURNING id',
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
