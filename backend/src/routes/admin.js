const express = require('express');
const { query } = require('../lib/db');
const { requireRole, ALLOWED_ROLES, createLocalAccount, hashPassword } = require('../lib/auth');

const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

const router = express.Router();
router.use(requireRole('admin'));

router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, email, username, name, avatar_url, role, oauth_provider, active, created_at, updated_at,
              (password_hash IS NOT NULL) AS has_password
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
    const { role, active, name, password } = req.body || {};
    if (role && !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    if (req.params.id === req.user.id && role && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot demote yourself' });
    }
    if (password != null && String(password).length > 0 && String(password).length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const existing = await query(
      `SELECT id, username FROM users WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.user.org_id]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Not found' });

    if (password != null && String(password).length >= 8 && !existing.rows[0].username) {
      return res.status(400).json({
        error: 'Cannot set a password on accounts without a username (Google-only). Create a local account instead.',
      });
    }

    const passwordHash =
      password != null && String(password).length >= 8 ? hashPassword(password) : null;

    const { rows } = await query(
      `UPDATE users SET
         role = COALESCE($3, role),
         active = COALESCE($4, active),
         name = COALESCE($5, name),
         password_hash = COALESCE($6, password_hash),
         updated_at = now()
       WHERE id = $1 AND org_id = $2
       RETURNING id, email, username, name, avatar_url, role, active, oauth_provider, created_at, updated_at,
                 (password_hash IS NOT NULL) AS has_password`,
      [
        req.params.id,
        req.user.org_id,
        role ?? null,
        active ?? null,
        name ?? null,
        passwordHash,
      ]
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
