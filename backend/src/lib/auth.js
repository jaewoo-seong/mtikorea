const crypto = require('crypto');
const { query } = require('./db');

const ALLOWED_ROLES = ['admin', 'member', 'viewer'];

const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN);
  const storedBuf = Buffer.from(hashHex, 'hex');
  if (storedBuf.length !== hash.length) return false;
  return crypto.timingSafeEqual(hash, storedBuf);
}

function parseDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function emailAllowed(email) {
  const domains = parseDomains();
  if (!domains.length) return true;
  const domain = String(email).split('@')[1]?.toLowerCase();
  return domains.includes(domain);
}

async function ensureDefaultOrg() {
  const { rows } = await query(
    `INSERT INTO organizations (name, slug)
     VALUES ('MTI Technology', 'mti')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`
  );
  return rows[0];
}

async function upsertGoogleUser({ email, name, avatarUrl, oauthId }) {
  if (!emailAllowed(email)) {
    const err = new Error(`Email domain not allowed: ${email}`);
    err.status = 403;
    throw err;
  }
  const org = await ensureDefaultOrg();
  const existing = await query('SELECT * FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) {
    const { rows } = await query(
      `UPDATE users SET name = COALESCE($2, name), avatar_url = COALESCE($3, avatar_url),
        oauth_provider = 'google', oauth_id = $4, updated_at = now()
       WHERE email = $1 RETURNING *`,
      [email, name, avatarUrl, oauthId]
    );
    return rows[0];
  }
  const count = await query('SELECT COUNT(*)::int AS c FROM users WHERE org_id = $1', [org.id]);
  const role = count.rows[0].c === 0 ? 'admin' : 'member';
  const { rows } = await query(
    `INSERT INTO users (org_id, email, name, avatar_url, role, oauth_provider, oauth_id)
     VALUES ($1, $2, $3, $4, $5, 'google', $6) RETURNING *`,
    [org.id, email, name, avatarUrl, role, oauthId]
  );
  return rows[0];
}

async function upsertDevUser() {
  const email = process.env.DEV_AUTH_EMAIL;
  if (!email) return null;
  const org = await ensureDefaultOrg();
  const existing = await query('SELECT * FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) return existing.rows[0];
  const { rows } = await query(
    `INSERT INTO users (org_id, email, name, role, oauth_provider)
     VALUES ($1, $2, $3, 'admin', 'dev') RETURNING *`,
    [org.id, email, process.env.DEV_AUTH_NAME || 'Dev Admin']
  );
  return rows[0];
}

async function createLocalAccount({ username, password, name }) {
  const org = await ensureDefaultOrg();
  const passwordHash = hashPassword(password);
  const syntheticEmail = `${String(username).toLowerCase()}@local.invalid`;
  const { rows } = await query(
    `INSERT INTO users (org_id, email, name, role, oauth_provider, username, password_hash)
     VALUES ($1, $2, $3, 'member', 'local', $4, $5) RETURNING *`,
    [org.id, syntheticEmail, name || username, username, passwordHash]
  );
  return rows[0];
}

function requireAuth(req, res, next) {
  if (!req.session?.userId || !req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { rows } = await query(
        'SELECT * FROM users WHERE id = $1 AND active = true',
        [req.session.userId]
      );
      const user = rows[0];
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (!roles.includes(user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

async function loadUser(req, res, next) {
  try {
    if (!req.session?.userId) {
      req.user = null;
      return next();
    }
    const { rows } = await query(
      `SELECT id, org_id, email, name, avatar_url, role, active, username, oauth_provider,
              (password_hash IS NOT NULL) AS has_password
       FROM users WHERE id = $1`,
      [req.session.userId]
    );
    req.user = rows[0] && rows[0].active ? rows[0] : null;
    if (!req.user) {
      req.session.destroy(() => {});
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  ALLOWED_ROLES,
  emailAllowed,
  ensureDefaultOrg,
  upsertGoogleUser,
  upsertDevUser,
  hashPassword,
  verifyPassword,
  createLocalAccount,
  requireAuth,
  requireRole,
  loadUser,
};
