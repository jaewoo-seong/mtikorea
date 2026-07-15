const express = require('express');
const { query } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const { testApiKey } = require('../lib/llmProviders');

const PROVIDERS = ['openrouter', 'nvidia'];

const router = express.Router();
router.use(requireRole('admin'));

function mask(key) {
  if (!key) return null;
  return key.length <= 4 ? '••••' : `••••${key.slice(-4)}`;
}

function present(row) {
  return { ...row, api_key: mask(row.api_key) };
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM llm_api_keys WHERE org_id = $1 ORDER BY created_at ASC`,
      [req.user.org_id]
    );
    res.json({ keys: rows.map(present) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { provider, label, apiKey, models } = req.body || {};
    if (!provider || !PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: `provider must be one of: ${PROVIDERS.join(', ')}` });
    }
    if (!label || !String(label).trim()) return res.status(400).json({ error: 'label required' });
    if (!apiKey || !String(apiKey).trim()) return res.status(400).json({ error: 'apiKey required' });
    const modelList = Array.isArray(models) ? models.map(String).filter(Boolean) : [];

    const check = await testApiKey(provider, apiKey.trim());

    const { rows } = await query(
      `INSERT INTO llm_api_keys (org_id, provider, label, api_key, models, status, last_checked_at, last_error, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,now(),$7,$8) RETURNING *`,
      [
        req.user.org_id,
        provider,
        label.trim(),
        apiKey.trim(),
        modelList,
        check.healthy ? 'healthy' : 'unhealthy',
        check.error,
        req.user.id,
      ]
    );
    res.status(201).json({ key: present(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const map = { label: 'label', models: 'models', active: 'active' };
    const updates = [];
    const params = [];
    for (const [k, col] of Object.entries(map)) {
      if (req.body[k] !== undefined) {
        params.push(req.body[k]);
        updates.push(`${col} = $${params.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    params.push(req.params.id, req.user.org_id);
    const { rows } = await query(
      `UPDATE llm_api_keys SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${params.length - 1} AND org_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ key: present(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/test', async (req, res, next) => {
  try {
    const existing = await query('SELECT * FROM llm_api_keys WHERE id = $1 AND org_id = $2', [
      req.params.id,
      req.user.org_id,
    ]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Not found' });
    const check = await testApiKey(existing.rows[0].provider, existing.rows[0].api_key);
    const { rows } = await query(
      `UPDATE llm_api_keys SET status = $3, last_checked_at = now(), last_error = $4, updated_at = now()
       WHERE id = $1 AND org_id = $2 RETURNING *`,
      [req.params.id, req.user.org_id, check.healthy ? 'healthy' : 'unhealthy', check.error]
    );
    res.json({ key: present(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'DELETE FROM llm_api_keys WHERE id = $1 AND org_id = $2 RETURNING id',
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
