const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth);

/** Org member list for task assignment (not admin-only). */
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, email, name, role, avatar_url, active
       FROM users WHERE org_id = $1 AND active = true ORDER BY name NULLS LAST, email`,
      [req.user.org_id]
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
