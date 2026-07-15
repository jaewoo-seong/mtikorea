const express = require('express');
const { query } = require('../lib/db');
const { requireRole, ALLOWED_ROLES, createLocalAccount } = require('../lib/auth');

const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

const router = express.Router();
router.use(requireRole('admin'));

router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, email, name, avatar_url, role, active, created_at, updated_at
       FROM users WHERE org_id = $1 ORDER BY created_at ASC`,
      [req.user.org_id]
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id', async (req, res, next) => {
  try {
    const { role, active, name } = req.body || {};
    if (role && !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    if (req.params.id === req.user.id && role && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot demote yourself' });
    }
    const { rows } = await query(
      `UPDATE users SET
         role = COALESCE($3, role),
         active = COALESCE($4, active),
         name = COALESCE($5, name),
         updated_at = now()
       WHERE id = $1 AND org_id = $2
       RETURNING id, email, name, avatar_url, role, active, created_at, updated_at`,
      [req.params.id, req.user.org_id, role ?? null, active ?? null, name ?? null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/users/invite', async (req, res, next) => {
  try {
    const { email, name, role } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const r = role && ALLOWED_ROLES.includes(role) ? role : 'member';
    const { rows } = await query(
      `INSERT INTO users (org_id, email, name, role, oauth_provider, active)
       VALUES ($1, lower($2), $3, $4, 'invite', true)
       ON CONFLICT (email) DO UPDATE SET
         active = true,
         role = EXCLUDED.role,
         name = COALESCE(EXCLUDED.name, users.name),
         updated_at = now()
       RETURNING id, email, name, role, active, created_at`,
      [req.user.org_id, email, name || null, r]
    );
    res.status(201).json({ user: rows[0], note: 'User can sign in via Google OAuth with this email' });
  } catch (err) {
    next(err);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const { username, password, name } = req.body || {};
    if (!username || !USERNAME_RE.test(username)) {
      return res.status(400).json({
        error: 'username required (letters, numbers, underscore, dash only, no spaces)',
      });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'password required (minimum 8 characters)' });
    }
    const created = await createLocalAccount({ username, password, name });
    const { password_hash, ...user } = created;
    res.status(201).json({ user });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Username already taken' });
    }
    next(err);
  }
});

module.exports = router;
